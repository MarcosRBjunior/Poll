-- btrim() sem segundo argumento remove só o espaço comum. As regras abaixo passam a
-- tratar também Tab, quebra de linha e retorno de carro como espaço em branco (spec 6.8).
-- Atenção: não incluir '\v' — em E'' ele vira a letra "v".

-- RN-07
ALTER TABLE "Answer" DROP CONSTRAINT answer_text_not_blank;
ALTER TABLE "Answer" ADD CONSTRAINT answer_text_not_blank
  CHECK ("textValue" IS NULL OR length(btrim("textValue", E' \t\n\r')) > 0);

-- RN-03
DROP INDEX question_option_label_active_uq;
CREATE UNIQUE INDEX question_option_label_active_uq
  ON "QuestionOption" ("questionId", lower(btrim("label", E' \t\n\r')))
  WHERE "archivedAt" IS NULL;

-- RN-01
ALTER TABLE "Survey" DROP CONSTRAINT survey_title_min;
ALTER TABLE "Survey" ADD CONSTRAINT survey_title_min
  CHECK (length(btrim("title", E' \t\n\r')) >= 3);
