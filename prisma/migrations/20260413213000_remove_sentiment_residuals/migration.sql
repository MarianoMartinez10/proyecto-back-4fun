-- Remove residual sentiment-analysis schema artifacts from reviews.
-- Safe to run multiple times due IF EXISTS guards.

ALTER TABLE "Review" DROP COLUMN IF EXISTS "sentiment";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "sentimentScore";

DROP TABLE IF EXISTS "ReviewKeyword";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Sentiment') THEN
    DROP TYPE "Sentiment";
  END IF;
END $$;
