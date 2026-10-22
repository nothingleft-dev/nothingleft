# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile -t nothingleft-api .
# One image serves the API and its one-off jobs: migrations, bucket setup, account scripts.
FROM oven/bun:1.4.2-slim
WORKDIR /app
COPY --chown=bun:bun . .
RUN bun install --frozen-lockfile --filter @nothingleft/api --filter @nothingleft/db
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0 LOG_TARGETS=json
USER bun
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["bun", "src/server.ts"]
