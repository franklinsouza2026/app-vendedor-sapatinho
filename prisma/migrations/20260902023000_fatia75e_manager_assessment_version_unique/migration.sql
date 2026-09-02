-- CreateIndex
CREATE UNIQUE INDEX "manager_assessment_subjectUserId_competencyId_version_key" ON "manager_assessment"("subjectUserId", "competencyId", "version");

