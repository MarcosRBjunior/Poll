-- Regras que o schema Prisma não expressa (spec, seção 6.8).

-- RN-07: texto não pode ser só espaços
ALTER TABLE "Answer" ADD CONSTRAINT answer_text_not_blank
  CHECK ("textValue" IS NULL OR length(btrim("textValue")) > 0);

-- RF-06: limites de seleção coerentes
ALTER TABLE "Question" ADD CONSTRAINT question_selection_bounds
  CHECK (("minSelections" IS NULL OR "minSelections" >= 0)
     AND ("maxSelections" IS NULL OR "maxSelections" >= 1)
     AND ("minSelections" IS NULL OR "maxSelections" IS NULL
          OR "minSelections" <= "maxSelections"));

-- RN-03: rótulo único entre opções ativas, sem diferenciar maiúsculas
CREATE UNIQUE INDEX question_option_label_active_uq
  ON "QuestionOption" ("questionId", lower(btrim("label")))
  WHERE "archivedAt" IS NULL;

-- RN-01: título com pelo menos 3 caracteres úteis
ALTER TABLE "Survey" ADD CONSTRAINT survey_title_min
  CHECK (length(btrim("title")) >= 3);

-- RF-20: vitrine da página inicial
CREATE INDEX survey_listed_idx ON "Survey" ("publishedAt" DESC)
  WHERE "status" = 'PUBLISHED' AND "isListed" AND "deletedAt" IS NULL;
