CREATE TABLE "Project" (
  "id" UUID PRIMARY KEY, "ownerId" UUID NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "activeRevisionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");
CREATE TABLE "Revision" (
  "id" UUID PRIMARY KEY, "projectId" UUID NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "parentRevisionId" UUID, "prompt" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "files" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'proposed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Revision_projectId_createdAt_idx" ON "Revision"("projectId", "createdAt");
CREATE TABLE "Deployment" (
  "id" UUID PRIMARY KEY, "projectId" UUID NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "revisionId" UUID NOT NULL, "providerId" TEXT NOT NULL UNIQUE, "url" TEXT, "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId", "createdAt");
-- Browser clients have no access to these tables. The server authenticates and scopes each query.
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deployment" ENABLE ROW LEVEL SECURITY;
