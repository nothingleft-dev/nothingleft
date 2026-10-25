# Deploying on AWS

Run Nothing Left on AWS with managed services: the web app and the API as containers on ECS
Fargate, PostgreSQL on RDS, Valkey on ElastiCache, files in S3 and mail through SES. An
Application Load Balancer is the only way in; everything else sits in private subnets.

To try Nothing Left first, or to run it on a single server, [Self-hosting with Docker
Compose](./self-hosting.md) is quicker.

## The shape of it

```
                     ┌──────────── public subnets ────────────┐
  browser, agent ──▶ │  Application Load Balancer (HTTPS)     │
                     └──────┬───────────────────────┬─────────┘
            work.example.com│                       │api.example.com
                     ┌──────▼──────┐         ┌──────▼──────┐
                     │ web (ECS)   │         │ api (ECS)   │──▶ SES (mail)
                     │ port 3000   │         │ port 4000   │
                     └─────────────┘         └──┬───────┬──┘
                       private subnets          │       │
                                       ┌────────▼─┐   ┌─▼──────────┐
                                       │ RDS      │   │ ElastiCache│
                                       │ Postgres │   │ Valkey     │
                                       └──────────┘   └────────────┘
  browser ──▶ S3: uploads and downloads go straight to the buckets, on short-lived signed links
```

| Piece                 | AWS service                     | Name in this guide                                  |
| --------------------- | ------------------------------- | --------------------------------------------------- |
| Network               | VPC, two public and two private subnets, one NAT gateway | `nothingleft`              |
| Entry point           | Application Load Balancer, ACM certificate | `nothingleft`                            |
| Web app and API       | ECS on Fargate, images in ECR   | cluster `nothingleft`, services `web` and `api`     |
| Database              | RDS for PostgreSQL 16           | `nothingleft`                                       |
| Cache                 | ElastiCache for Valkey          | `nothingleft`                                       |
| Files                 | Two S3 buckets: private for attachments, public for avatars | `acme-nothingleft-private`, `acme-nothingleft-public` |
| Mail                  | SES over SMTP                   | -                                                   |
| Secrets               | Secrets Manager                 | `nothingleft/api`                                   |

Each step below says what to create and with which settings, first for the AWS console and then
as AWS CLI commands. Use either, step by step. The commands build on the variables earlier
steps set, so run them in one terminal, from a checkout of the repository.

## Before you start

You need:

- An AWS account, and the AWS CLI v2 signed in to it with administrator access.
- Docker, to build the images.
- A domain whose DNS you can edit. The web app and the API need two names under the same parent
  domain, such as `work.example.com` and `api.example.com`: the session cookie is shared across
  that parent domain, so two unrelated domains cannot work.

```sh
git clone https://github.com/nothingleft-dev/nothingleft.git
cd nothingleft

export AWS_REGION=eu-west-1 AWS_PAGER=""
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export DOMAIN=example.com
export APP_HOST=work.$DOMAIN API_HOST=api.$DOMAIN
export PRIVATE_BUCKET=acme-nothingleft-private PUBLIC_BUCKET=acme-nothingleft-public
# ARM (Graviton) costs less on Fargate. On an x86 machine, linux/amd64 and X86_64 build faster.
export PLATFORM=linux/arm64 ARCH=ARM64

# Generated once. Secrets Manager keeps them from step 8 on.
export OWNER_PW=$(openssl rand -hex 24) APP_PW=$(openssl rand -hex 24) CACHE_TOKEN=$(openssl rand -hex 32)
export ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32) EMAIL_LINK_SECRET=$(openssl rand -hex 32)
```

Bucket names are global across AWS, so choose your own.

## 1. Network

Two public subnets hold the load balancer; two private subnets hold everything else. The NAT
gateway lets the private side pull images and send mail; the S3 gateway endpoint keeps the API's
file traffic inside AWS.

**In the console**

| Create                  | Settings                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPC `nothingleft`       | "VPC and more". IPv4 CIDR `10.0.0.0/16`. 2 Availability Zones, 2 public and 2 private subnets. NAT gateway in 1 AZ. VPC endpoint: S3 Gateway. DNS hostnames and DNS resolution on |

**With the CLI**

```sh
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=nothingleft}]' --query Vpc.VpcId --output text)
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
read AZ1 AZ2 <<<"$(aws ec2 describe-availability-zones --query 'AvailabilityZones[0:2].ZoneName' --output text)"

subnet() { aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block $1 --availability-zone $2 --query Subnet.SubnetId --output text; }
PUB1=$(subnet 10.0.0.0/24 $AZ1); PUB2=$(subnet 10.0.1.0/24 $AZ2)
PRIV1=$(subnet 10.0.10.0/24 $AZ1); PRIV2=$(subnet 10.0.11.0/24 $AZ2)

IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW --vpc-id $VPC_ID
PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $PUB_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB1
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB2

EIP=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
NAT=$(aws ec2 create-nat-gateway --subnet-id $PUB1 --allocation-id $EIP --query NatGateway.NatGatewayId --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT
PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $PRIV_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV1
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV2
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --service-name com.amazonaws.$AWS_REGION.s3 --route-table-ids $PRIV_RT
```

An existing VPC works too, if it has two public and two private subnets in two Availability
Zones and the private ones reach the internet through a NAT gateway.

## 2. Security groups

Each group admits traffic only from the one in front of it: the internet reaches the load
balancer, the load balancer reaches the containers, and only the API reaches the database and
the cache. The `admin` group is for the one-time database setup in step 5.

**In the console**

| Create                     | Inbound rules                                                              |
| -------------------------- | -------------------------------------------------------------------------- |
| Security group `nothingleft-alb`   | TCP 443 and TCP 80 from `0.0.0.0/0`                                |
| Security group `nothingleft-web`   | TCP 3000 from `nothingleft-alb`                                    |
| Security group `nothingleft-api`   | TCP 4000 from `nothingleft-alb`                                    |
| Security group `nothingleft-db`    | TCP 5432 from `nothingleft-api` and from `nothingleft-admin`       |
| Security group `nothingleft-cache` | TCP 6379 from `nothingleft-api`                                    |
| Security group `nothingleft-admin` | None                                                               |

All in the `nothingleft` VPC, with the default outbound rule.

**With the CLI**

```sh
new_sg() { aws ec2 create-security-group --vpc-id $VPC_ID --group-name $1 --description "$2" --query GroupId --output text; }
ALB_SG=$(new_sg nothingleft-alb "Load balancer"); WEB_SG=$(new_sg nothingleft-web "Web app")
API_SG=$(new_sg nothingleft-api "API"); DB_SG=$(new_sg nothingleft-db "PostgreSQL")
CACHE_SG=$(new_sg nothingleft-cache "Valkey"); ADMIN_SG=$(new_sg nothingleft-admin "Database setup")

allow() { aws ec2 authorize-security-group-ingress --group-id $1 --protocol tcp --port $2 "${@:3}" > /dev/null; }
allow $ALB_SG 443 --cidr 0.0.0.0/0; allow $ALB_SG 80 --cidr 0.0.0.0/0
allow $WEB_SG 3000 --source-group $ALB_SG; allow $API_SG 4000 --source-group $ALB_SG
allow $DB_SG 5432 --source-group $API_SG; allow $DB_SG 5432 --source-group $ADMIN_SG
allow $CACHE_SG 6379 --source-group $API_SG
```

## 3. File storage

Two buckets. The **private** bucket holds attachments, exports and imports: nothing in it is
public, and every download goes through the API, which checks who is asking and then hands the
browser a link that works for a few minutes. The **public** bucket holds avatars only, readable by
anyone. Both accept uploads straight from the browser, so both allow the web app's address.

**In the console**

| Create                                | Settings                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S3 bucket `acme-nothingleft-private`  | Object Ownership: bucket owner enforced. Block all public access: on. CORS: the rule below                                        |
| S3 bucket `acme-nothingleft-public`   | Object Ownership: bucket owner enforced. Block public access: only "through new ACLs" and "through any ACLs" on. Bucket policy: the policy below. CORS: the rule below |

The CORS rule for both buckets, with your web app's address:

```json
[
  {
    "AllowedOrigins": ["https://work.example.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

The public bucket's policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::acme-nothingleft-public/*"
    }
  ]
}
```

If the account blocks public access for every bucket (S3 → Block Public Access settings for
this account), the public bucket's policy is refused until that is relaxed.

**With the CLI**

```sh
# In us-east-1, leave out --create-bucket-configuration.
for bucket in $PRIVATE_BUCKET $PUBLIC_BUCKET; do
  aws s3api create-bucket --bucket $bucket --create-bucket-configuration LocationConstraint=$AWS_REGION
  aws s3api put-bucket-cors --bucket $bucket --cors-configuration \
    "{\"CORSRules\":[{\"AllowedOrigins\":[\"https://$APP_HOST\"],\"AllowedMethods\":[\"PUT\",\"GET\",\"HEAD\"],\"AllowedHeaders\":[\"*\"],\"MaxAgeSeconds\":3600}]}"
done
aws s3api put-public-access-block --bucket $PUBLIC_BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $PUBLIC_BUCKET --policy \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$PUBLIC_BUCKET/*\"}]}"
```

New buckets block all public access already, so the private bucket needs nothing more. Avatars
load from `https://acme-nothingleft-public.s3.eu-west-1.amazonaws.com`. To serve them from your
own domain, put CloudFront in front of the public bucket and use its address in step 9 instead.

## 4. Database

PostgreSQL 16 on RDS, reachable only from the API and from the setup environment.

**In the console**

| Create                        | Settings                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DB subnet group `nothingleft` | The two private subnets                                                                                                                                                        |
| RDS database `nothingleft`    | PostgreSQL 16. Instance `db.t4g.small` or larger. 20 GiB gp3, encrypted. Master username `nladmin`, password managed in Secrets Manager. Subnet group `nothingleft`, not publicly accessible, security group `nothingleft-db`. Automated backups: 7 days |

**With the CLI**

```sh
aws rds create-db-subnet-group --db-subnet-group-name nothingleft \
  --db-subnet-group-description "Nothing Left" --subnet-ids $PRIV1 $PRIV2
PG_VERSION=$(aws rds describe-db-engine-versions --engine postgres --db-parameter-group-family postgres16 \
  --default-only --query 'DBEngineVersions[0].EngineVersion' --output text)
aws rds create-db-instance --db-instance-identifier nothingleft \
  --engine postgres --engine-version $PG_VERSION --db-instance-class db.t4g.small \
  --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --master-username nladmin --manage-master-user-password \
  --db-subnet-group-name nothingleft --vpc-security-group-ids $DB_SG \
  --no-publicly-accessible --backup-retention-period 7
aws rds wait db-instance-available --db-instance-identifier nothingleft
DB_HOST=$(aws rds describe-db-instances --db-instance-identifier nothingleft \
  --query 'DBInstances[0].Endpoint.Address' --output text)
```

Creating the database takes about ten minutes.

## 5. Database roles

The application uses two roles. The **owner** creates and changes tables; it runs only the
migrations. The **application role** runs every query the API makes, and cannot rewrite the
audit log. The master user creates both once, from inside the VPC. AWS CloudShell can work
there.

**In the console**

| Create                            | Settings                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| CloudShell VPC environment `nothingleft` | VPC `nothingleft`, one private subnet, security group `nothingleft-admin` |

In your own terminal, print the values CloudShell needs:

```sh
echo "export DB_HOST=$DB_HOST OWNER_PW=$OWNER_PW APP_PW=$APP_PW"
```

In the CloudShell VPC environment, paste that line, then:

```sh
sudo dnf install -y postgresql16
curl -sO https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
SECRET=$(aws rds describe-db-instances --db-instance-identifier nothingleft \
  --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text)
export PGPASSWORD=$(aws secretsmanager get-secret-value --secret-id $SECRET --query SecretString --output text | jq -r .password)

psql "host=$DB_HOST dbname=postgres user=nladmin sslmode=verify-full sslrootcert=global-bundle.pem" \
  -v ON_ERROR_STOP=1 -v owner_password="$OWNER_PW" -v app_password="$APP_PW" <<'SQL'
CREATE ROLE nothingleft_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE nothingleft_app LOGIN PASSWORD :'app_password' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT nothingleft_owner TO CURRENT_USER;
CREATE DATABASE nothingleft OWNER nothingleft_owner;
\connect nothingleft
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SET ROLE nothingleft_owner;
GRANT USAGE ON SCHEMA public TO nothingleft_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nothingleft_app;
SQL
```

The order matters: the application role must exist before the first migration, which then
narrows its access to the audit log to reading and adding. The extension is created here because
the owner may not create it. Delete the CloudShell environment afterwards.

## 6. Cache

Valkey with encryption in transit and a password. The API refuses an unencrypted connection to
anything but a local cache.

**In the console**

| Create                                 | Settings                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElastiCache subnet group `nothingleft` | The two private subnets                                                                                                                                     |
| ElastiCache Valkey cache `nothingleft` | Design your own cache, node-based cluster. Cluster mode disabled. Valkey 8. Node type `cache.t4g.micro`, no replicas. Subnet group `nothingleft`, security group `nothingleft-cache`. Encryption in transit: required, with an AUTH token (`$CACHE_TOKEN`). Encryption at rest on |

**With the CLI**

```sh
aws elasticache create-cache-subnet-group --cache-subnet-group-name nothingleft \
  --cache-subnet-group-description "Nothing Left" --subnet-ids $PRIV1 $PRIV2
aws elasticache create-replication-group --replication-group-id nothingleft \
  --replication-group-description "Nothing Left" \
  --engine valkey --engine-version 8.0 --cache-node-type cache.t4g.micro --num-cache-clusters 1 \
  --cache-subnet-group-name nothingleft --security-group-ids $CACHE_SG \
  --transit-encryption-enabled --at-rest-encryption-enabled --auth-token $CACHE_TOKEN
aws elasticache wait replication-group-available --replication-group-id nothingleft
CACHE_HOST=$(aws elasticache describe-replication-groups --replication-group-id nothingleft \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text)
```

## 7. Mail

SES sends sign-up confirmations, password resets, invitations and notifications.

**In the console**

| Create                         | Settings                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| SES domain identity `example.com` | Easy DKIM, RSA 2048. Add the three CNAME records it lists to your DNS                         |
| SES production access          | Request it under Account dashboard; until it is granted, SES only sends to verified addresses     |
| SES SMTP credentials           | SMTP settings → Create SMTP credentials. Keep the user name and password for step 8              |

**With the CLI**

```sh
aws sesv2 create-email-identity --email-identity $DOMAIN --query DkimAttributes.Tokens --output text
# For each token: a CNAME <token>._domainkey.example.com → <token>.dkim.amazonses.com
export SMTP_USER=... SMTP_PASSWORD=...   # from the console: SMTP credentials are made there
```

## 8. Secrets

Every secret the API reads, in one Secrets Manager secret. ECS hands each value to the
container as an environment variable.

**In the console**

| Create                                       | Settings                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| Secrets Manager secret `nothingleft/api`     | Other type of secret, key/value pairs: the keys below       |

| Key                     | Value                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `postgres://nothingleft_owner:<owner password>@<RDS endpoint>:5432/nothingleft?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem` |
| `DATABASE_URL_POOLED`   | The same with `nothingleft_app` and its password                                                                                              |
| `REDIS_URL`             | `rediss://:<AUTH token>@<Valkey primary endpoint>:6379`                                                                                       |
| `ENCRYPTION_MASTER_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`)                                                                                           |
| `EMAIL_LINK_SECRET`     | 32 or more random characters (`openssl rand -hex 32`)                                                                                         |
| `SMTP_USER`, `SMTP_PASSWORD` | The SES SMTP credentials                                                                                                                 |

Keep a copy of `ENCRYPTION_MASTER_KEY` somewhere safe. It seals two-factor and storage secrets,
and without it a restored database has secrets nobody can read.

**With the CLI**

```sh
DB_OPTS="sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem"
SECRET_ARN=$(aws secretsmanager create-secret --name nothingleft/api --query ARN --output text --secret-string "$(cat <<EOF
{
  "DATABASE_URL": "postgres://nothingleft_owner:$OWNER_PW@$DB_HOST:5432/nothingleft?$DB_OPTS",
  "DATABASE_URL_POOLED": "postgres://nothingleft_app:$APP_PW@$DB_HOST:5432/nothingleft?$DB_OPTS",
  "REDIS_URL": "rediss://:$CACHE_TOKEN@$CACHE_HOST:6379",
  "ENCRYPTION_MASTER_KEY": "$ENCRYPTION_MASTER_KEY",
  "EMAIL_LINK_SECRET": "$EMAIL_LINK_SECRET",
  "SMTP_USER": "$SMTP_USER",
  "SMTP_PASSWORD": "$SMTP_PASSWORD"
}
EOF
)")
```

To sign in with Google or GitHub, add `GOOGLE_CLIENT_SECRET` or `GITHUB_CLIENT_SECRET` here and
the client ID to the API's settings in step 10.

To let organisations connect GitHub in one click, register a GitHub App as described in
[Connect GitHub and GitLab](./self-hosting.md#connect-github-and-gitlab), using your web app's and
API's addresses. Add `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET` and
`GITHUB_APP_WEBHOOK_SECRET` here, and `GITHUB_APP_ID`, `GITHUB_APP_SLUG` and `GITHUB_APP_CLIENT_ID`
to the API's settings in step 10. Without them GitHub connects in manual mode; GitLab needs nothing.

## 9. Images

Build both images and push them to ECR. The API image gains the RDS certificate bundle, so the
connection to the database is verified. The web app's address for the API is compiled into the
web image, so the image is built for your API's address.

**In the console**

| Create                         | Settings          |
| ------------------------------ | ----------------- |
| ECR repository `nothingleft-api` | Private, defaults |
| ECR repository `nothingleft-web` | Private, defaults |

**With the CLI**

```sh
aws ecr create-repository --repository-name nothingleft-api > /dev/null
aws ecr create-repository --repository-name nothingleft-web > /dev/null
REGISTRY=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY

TAG=$(git rev-parse --short HEAD)
docker build --platform $PLATFORM -f apps/api/Dockerfile -t nothingleft-api .
docker build --platform $PLATFORM -t $REGISTRY/nothingleft-api:$TAG - <<'EOF'
FROM nothingleft-api
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
EOF
docker build --platform $PLATFORM -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://$API_HOST -t $REGISTRY/nothingleft-web:$TAG .
docker push $REGISTRY/nothingleft-api:$TAG
docker push $REGISTRY/nothingleft-web:$TAG
```

`PLATFORM` and `ARCH` from the start choose the processor the containers run on. Building for
an architecture other than your machine's runs under emulation, which is much slower; in the
console, pick the matching architecture in the task definitions.

To show a contact address where the app says "email us", add
`--build-arg NEXT_PUBLIC_SUPPORT_EMAIL=help@example.com` to the web build.

## 10. Roles, logs and task definitions

Two IAM roles. The **execution role** lets ECS pull the images, write logs and read the secret.
The **API task role** is what the API itself runs as: it may read, write and delete objects in
the two buckets and nothing else, so no storage keys exist to leak.

**In the console**

| Create                              | Settings                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| IAM role `nothingleft-execution`    | Trusted entity: Elastic Container Service Task. Policy `AmazonECSTaskExecutionRolePolicy`, plus `secretsmanager:GetSecretValue` on `nothingleft/api` |
| IAM role `nothingleft-api`          | Trusted entity: Elastic Container Service Task. The bucket policy below                                                                         |
| CloudWatch log group `/ecs/nothingleft` | Retention to suit you                                                                                                                        |
| ECS cluster `nothingleft`           | Fargate only                                                                                                                                     |
| Task definition `nothingleft-api`   | Fargate, Linux/ARM64 (or X86_64, to match the images), 0.5 vCPU, 1 GB. Task role `nothingleft-api`, execution role `nothingleft-execution`. Container `api`: the API image, port 4000, the environment and secrets below, logs to `/ecs/nothingleft` with prefix `api` |
| Task definition `nothingleft-web`   | Fargate, the same architecture, 0.25 vCPU, 0.5 GB. No task role, execution role `nothingleft-execution`. Container `web`: the web image, port 3000, logs with prefix `web` |

The API task role's policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": ["arn:aws:s3:::acme-nothingleft-private", "arn:aws:s3:::acme-nothingleft-public"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::acme-nothingleft-private/*", "arn:aws:s3:::acme-nothingleft-public/*"]
    }
  ]
}
```

`s3:ListBucket` lets the API tell a missing file from a forbidden one, and lets `/health/deep`
check the private bucket.

The API container's environment:

| Variable                    | Value                                                     |
| --------------------------- | --------------------------------------------------------- |
| `APP_BASE_URL`              | `https://work.example.com`                                |
| `API_BASE_URL`              | `https://api.example.com`                                 |
| `SESSION_COOKIE_DOMAIN`     | `.example.com`                                            |
| `TRUST_PROXY`               | `1` - the load balancer is one hop                        |
| `S3_ENDPOINT`               | `https://s3.eu-west-1.amazonaws.com`                      |
| `S3_REGION`                 | `eu-west-1`                                               |
| `S3_PRIVATE_BUCKET`         | `acme-nothingleft-private`                                |
| `S3_PUBLIC_BUCKET`          | `acme-nothingleft-public`                                 |
| `S3_PUBLIC_BUCKET_BASE_URL` | `https://acme-nothingleft-public.s3.eu-west-1.amazonaws.com` |
| `EMAIL_PROVIDER`            | `smtp`                                                    |
| `SMTP_HOST`                 | `email-smtp.eu-west-1.amazonaws.com`                      |
| `SMTP_PORT`                 | `587`                                                     |
| `EMAIL_FROM`                | `Nothing Left <noreply@example.com>`                      |
| `SUPPORT_EMAIL`             | Optional: where replies to any email go                   |

Its secrets, each from `nothingleft/api` by the same key: `DATABASE_URL`, `DATABASE_URL_POOLED`,
`REDIS_URL`, `ENCRYPTION_MASTER_KEY`, `EMAIL_LINK_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`. Leave
out `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: without them, the API signs with its task role.

**With the CLI**

```sh
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam create-role --role-name nothingleft-execution --assume-role-policy-document "$TRUST" > /dev/null
aws iam attach-role-policy --role-name nothingleft-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name nothingleft-execution --policy-name read-api-secret --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"$SECRET_ARN\"}]}"

aws iam create-role --role-name nothingleft-api --assume-role-policy-document "$TRUST" > /dev/null
aws iam put-role-policy --role-name nothingleft-api --policy-name buckets --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":["arn:aws:s3:::$PRIVATE_BUCKET","arn:aws:s3:::$PUBLIC_BUCKET"]},
  {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],
   "Resource":["arn:aws:s3:::$PRIVATE_BUCKET/*","arn:aws:s3:::$PUBLIC_BUCKET/*"]}
]}
EOF
)"

aws logs create-log-group --log-group-name /ecs/nothingleft
aws ecs create-cluster --cluster-name nothingleft > /dev/null

ROLE=arn:aws:iam::$ACCOUNT_ID:role
env_var() { printf '{"name":"%s","value":"%s"}' "$1" "$2"; }
secret() { printf '{"name":"%s","valueFrom":"%s:%s::"}' "$1" "$SECRET_ARN" "$1"; }
logs_to() { printf '{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/nothingleft","awslogs-region":"%s","awslogs-stream-prefix":"%s"}}' "$AWS_REGION" "$1"; }

aws ecs register-task-definition --cli-input-json "$(cat <<EOF
{
  "family": "nothingleft-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "runtimePlatform": {"cpuArchitecture": "$ARCH", "operatingSystemFamily": "LINUX"},
  "cpu": "512", "memory": "1024",
  "executionRoleArn": "$ROLE/nothingleft-execution",
  "taskRoleArn": "$ROLE/nothingleft-api",
  "containerDefinitions": [{
    "name": "api",
    "image": "$REGISTRY/nothingleft-api:$TAG",
    "essential": true,
    "portMappings": [{"containerPort": 4000}],
    "environment": [
      $(env_var APP_BASE_URL https://$APP_HOST), $(env_var API_BASE_URL https://$API_HOST),
      $(env_var SESSION_COOKIE_DOMAIN .$DOMAIN), $(env_var TRUST_PROXY 1),
      $(env_var S3_ENDPOINT https://s3.$AWS_REGION.amazonaws.com), $(env_var S3_REGION $AWS_REGION),
      $(env_var S3_PRIVATE_BUCKET $PRIVATE_BUCKET), $(env_var S3_PUBLIC_BUCKET $PUBLIC_BUCKET),
      $(env_var S3_PUBLIC_BUCKET_BASE_URL https://$PUBLIC_BUCKET.s3.$AWS_REGION.amazonaws.com),
      $(env_var EMAIL_PROVIDER smtp), $(env_var SMTP_HOST email-smtp.$AWS_REGION.amazonaws.com),
      $(env_var SMTP_PORT 587), $(env_var EMAIL_FROM "Nothing Left <noreply@$DOMAIN>")
    ],
    "secrets": [
      $(secret DATABASE_URL), $(secret DATABASE_URL_POOLED), $(secret REDIS_URL),
      $(secret ENCRYPTION_MASTER_KEY), $(secret EMAIL_LINK_SECRET),
      $(secret SMTP_USER), $(secret SMTP_PASSWORD)
    ],
    "logConfiguration": $(logs_to api)
  }]
}
EOF
)" > /dev/null

aws ecs register-task-definition --cli-input-json "$(cat <<EOF
{
  "family": "nothingleft-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "runtimePlatform": {"cpuArchitecture": "$ARCH", "operatingSystemFamily": "LINUX"},
  "cpu": "256", "memory": "512",
  "executionRoleArn": "$ROLE/nothingleft-execution",
  "containerDefinitions": [{
    "name": "web",
    "image": "$REGISTRY/nothingleft-web:$TAG",
    "essential": true,
    "portMappings": [{"containerPort": 3000}],
    "logConfiguration": $(logs_to web)
  }]
}
EOF
)" > /dev/null
```

## 11. Migrate the database

Run the API image once with the migration command. It creates every table as the owner role and
exits.

**In the console**

Run a task in cluster `nothingleft`: Fargate, task definition `nothingleft-api`, the private
subnets, security group `nothingleft-api`, no public IP. Override the `api` container's command
with `bun,run,--cwd,/app/packages/db,db:migrate`. It should stop with exit code 0.

**With the CLI**

```sh
API_NET="awsvpcConfiguration={subnets=[$PRIV1,$PRIV2],securityGroups=[$API_SG],assignPublicIp=DISABLED}"
migrate() {
  local task=$(aws ecs run-task --cluster nothingleft --launch-type FARGATE \
    --task-definition nothingleft-api --network-configuration "$API_NET" \
    --overrides '{"containerOverrides":[{"name":"api","command":["bun","run","--cwd","/app/packages/db","db:migrate"]}]}' \
    --query 'tasks[0].taskArn' --output text)
  aws ecs wait tasks-stopped --cluster nothingleft --tasks $task
  aws ecs describe-tasks --cluster nothingleft --tasks $task --query 'tasks[0].containers[0].exitCode'
}
migrate
```

`0` means the database is ready. Anything else: the task's log, under `/ecs/nothingleft`, says
why.

## 12. Load balancer and services

The load balancer ends HTTPS and sends each host name to its service. Port 80 only redirects to
443, and a request for any other host name gets a 404.

**In the console**

| Create                                 | Settings                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ACM certificate                        | `work.example.com` and `api.example.com`, DNS validation. Add the CNAME records it lists                                          |
| Target group `nothingleft-web`         | Type IP, HTTP 3000, VPC `nothingleft`. Health check path `/sign-in`                                                              |
| Target group `nothingleft-api`         | Type IP, HTTP 4000, VPC `nothingleft`. Health check path `/health`                                                               |
| Application Load Balancer `nothingleft` | Internet-facing, the two public subnets, security group `nothingleft-alb`                                                       |
| Listener HTTP 80                       | Redirect to HTTPS 443                                                                                                            |
| Listener HTTPS 443                     | The ACM certificate. Default action: fixed response 404. Rules: host `work.example.com` → `nothingleft-web`; host `api.example.com` → `nothingleft-api` |
| ECS service `api`                      | Cluster `nothingleft`, Fargate, task definition `nothingleft-api`, 1 task. Private subnets, security group `nothingleft-api`, no public IP. Load balancer target group `nothingleft-api`. Deployment circuit breaker with rollback on |
| ECS service `web`                      | The same with `nothingleft-web`, security group `nothingleft-web` and target group `nothingleft-web`                            |

**With the CLI**

```sh
CERT_ARN=$(aws acm request-certificate --domain-name $APP_HOST --subject-alternative-names $API_HOST \
  --validation-method DNS --query CertificateArn --output text)
sleep 10
aws acm describe-certificate --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord.[Name,Value]' --output text
# Add each as a CNAME record at your DNS provider, then:
aws acm wait certificate-validated --certificate-arn $CERT_ARN

ALB_ARN=$(aws elbv2 create-load-balancer --name nothingleft --type application --scheme internet-facing \
  --subnets $PUB1 $PUB2 --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text)
target_group() { aws elbv2 create-target-group --name $1 --protocol HTTP --port $2 --vpc-id $VPC_ID \
  --target-type ip --health-check-path $3 --query 'TargetGroups[0].TargetGroupArn' --output text; }
WEB_TG=$(target_group nothingleft-web 3000 /sign-in)
API_TG=$(target_group nothingleft-api 4000 /health)

aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' > /dev/null
LISTENER=$(aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERT_ARN --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions 'Type=fixed-response,FixedResponseConfig={StatusCode=404,ContentType=text/plain}' \
  --query 'Listeners[0].ListenerArn' --output text)
aws elbv2 create-rule --listener-arn $LISTENER --priority 10 \
  --conditions Field=host-header,Values=$APP_HOST --actions Type=forward,TargetGroupArn=$WEB_TG > /dev/null
aws elbv2 create-rule --listener-arn $LISTENER --priority 20 \
  --conditions Field=host-header,Values=$API_HOST --actions Type=forward,TargetGroupArn=$API_TG > /dev/null

WEB_NET="awsvpcConfiguration={subnets=[$PRIV1,$PRIV2],securityGroups=[$WEB_SG],assignPublicIp=DISABLED}"
create_service() { aws ecs create-service --cluster nothingleft --service-name $1 --task-definition nothingleft-$1 \
  --desired-count 1 --launch-type FARGATE --network-configuration "$2" \
  --load-balancers targetGroupArn=$3,containerName=$1,containerPort=$4 --health-check-grace-period-seconds 60 \
  --deployment-configuration 'deploymentCircuitBreaker={enable=true,rollback=true}' > /dev/null; }
create_service api "$API_NET" $API_TG 4000
create_service web "$WEB_NET" $WEB_TG 3000
aws ecs wait services-stable --cluster nothingleft --services api web
```

## 13. Point your domain at it

**In the console**

| Create                                           | Settings                                                   |
| ------------------------------------------------ | ---------------------------------------------------------- |
| DNS record `work.example.com`, `api.example.com` | CNAME to the load balancer's DNS name. In Route 53, an alias A record to the load balancer |

**With the CLI**

```sh
aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query 'LoadBalancers[0].DNSName' --output text
```

Then check the whole chain:

```sh
curl -s https://$API_HOST/health/deep
```

Every check says `ok`: `db`, `redis` and `storage`. Open `https://work.example.com`, sign up, and
carry on as in [Getting started](./getting-started.md). Agents reach the MCP endpoint at
`https://api.example.com/mcp` ([Connecting an AI agent](./mcp.md)).

## Who can sign up

Anyone who can open the web app's address can create an account and their own organisation.
There is no setting that turns sign-up off. To keep an install to your team, narrow the
`nothingleft-alb` security group's port 443 rule to your offices' or VPN's addresses, or put the
load balancer behind AWS WAF with an allow list.

## Upgrading

```sh
git pull
aws rds create-db-snapshot --db-instance-identifier nothingleft --db-snapshot-identifier nothingleft-$(date +%Y%m%d%H%M)
```

Then repeat step 9 to build and push images with the new `TAG`, register new revisions of both
task definitions as in step 10, run `migrate` as in step 11, and roll the services onto them:

```sh
aws ecs update-service --cluster nothingleft --service api --task-definition nothingleft-api > /dev/null
aws ecs update-service --cluster nothingleft --service web --task-definition nothingleft-web > /dev/null
aws ecs wait services-stable --cluster nothingleft --services api web
```

If the new tasks fail their health checks, ECS rolls the service back to the previous revision.
Rolling back an image does not undo a migration; the snapshot taken first does.

## Backups

- **Database.** RDS keeps automated backups for the 7 days set in step 4 and restores to any
  second within them. Take a manual snapshot before every upgrade.
- **Files.** Turn on versioning for the private bucket to keep deleted and overwritten files
  recoverable, with a lifecycle rule that expires old versions.
- **Secrets.** `nothingleft/api` holds `ENCRYPTION_MASTER_KEY`. Losing it makes two-factor and
  storage secrets unreadable; deleting the secret has a recovery window, but keep a copy
  elsewhere too.

## Day to day

| Task                  | How                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Read the logs         | CloudWatch log group `/ecs/nothingleft`, streams `api/…` and `web/…`, or `aws logs tail /ecs/nothingleft --follow`                         |
| Deactivate an account | Run a task as in step 11 with the command `bun,run,account,deactivate,someone@example.com`; `reactivate` reverses it                        |
| Scale                 | Raise the services' desired count. Both services hold no state between requests, so any number of tasks can run side by side               |
| Change a setting      | Register a new task definition revision with it, then `update-service` as in Upgrading. A change to `API_BASE_URL` also needs a new web image |
| Raise limits          | `FREE_SEAT_LIMIT` and `FREE_STORAGE_BYTES` in the API's environment ([Limits and billing](./limits-and-billing.md#self-hosting))            |

The load balancer polls `/health`, which answers whenever the API is running. `/health/deep` also
checks the database, Valkey and the private bucket; point an external uptime checker at it, no
more often than every 10 seconds.

## When something goes wrong

**The API task stops straight away.** Its log starts with `Invalid environment`, followed by the
setting at fault. A secret that ECS could not read shows instead as a stopped task with
`ResourceInitializationError`: check the execution role's access to `nothingleft/api`.

**The database refuses the connection.** A certificate error means the API image was pushed
without the RDS bundle from step 9. A timeout means a security group: `nothingleft-db` must admit
`nothingleft-api`.

**Targets stay unhealthy.** The target groups must be of type IP, and the services' security
groups must admit the load balancer on ports 3000 and 4000.

**Sign-in goes straight back to the sign-in page.** `SESSION_COOKIE_DOMAIN` must be the parent
domain of both host names, with a leading dot, and both must be served over HTTPS.

**Uploads fail with a CORS error.** The buckets' CORS rule must name the web app's address
exactly, with `https://` and no trailing slash.

**Avatars do not load.** The public bucket's policy is missing, or the account's Block Public
Access settings refuse it.

**No email arrives.** Until SES grants production access, it delivers only to verified
addresses. Look for `email not sent` or an SMTP error in the API's log.
