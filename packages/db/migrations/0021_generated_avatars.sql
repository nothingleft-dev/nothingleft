-- Data only: generated marks are no longer stored. A NULL avatar_url renders the API's own
-- initials mark from the current name, so no name is sent to a hosted avatar service.
UPDATE "users" SET "avatar_url" = NULL WHERE "avatar_url" LIKE 'https://api.dicebear.com/%';
