import type { PrismaClient } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { seedGroups, seedSurveys, type SeedQuestion } from "./data";

export class SeedError extends Error {
  override readonly name = "SeedError";
}

export type SeedResult = { created: string[]; skipped: string[] };

const isChoice = (q: SeedQuestion) => q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE";

/**
 * Cria os grupos e as pesquisas iniciais do administrador (RF-19).
 * Idempotente: grupo existente é reaproveitado e pesquisa com o mesmo slug é ignorada.
 */
export async function runSeed(
  db: PrismaClient,
  adminEmail: string | undefined,
): Promise<SeedResult> {
  const email = adminEmail?.trim().toLowerCase();
  if (!email) throw new SeedError("ADMIN_EMAIL não está definida.");

  const admin = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!admin) {
    throw new SeedError(
      "Nenhum usuário com o e-mail de ADMIN_EMAIL. Entre no app uma vez com esse e-mail e rode o seed de novo.",
    );
  }

  return db.$transaction(async (tx) => {
    const groupIds = new Map<string, string>();
    for (const name of seedGroups) {
      const group = await tx.surveyGroup.upsert({
        where: { ownerId_name: { ownerId: admin.id, name } },
        create: { ownerId: admin.id, name },
        update: {},
        select: { id: true },
      });
      groupIds.set(name, group.id);
    }

    const result: SeedResult = { created: [], skipped: [] };
    for (const survey of seedSurveys) {
      const slug = slugify(survey.title);
      if (await tx.survey.findUnique({ where: { slug }, select: { id: true } })) {
        result.skipped.push(slug);
        continue;
      }
      await tx.survey.create({
        data: {
          ownerId: admin.id,
          groupId: groupIds.get(survey.group),
          title: survey.title,
          slug,
          status: "PUBLISHED",
          isListed: true,
          publishedAt: new Date(),
          questions: {
            create: survey.questions.map((question, position) => ({
              type: question.type,
              title: question.title,
              required: isChoice(question),
              position,
              options: {
                create: (question.options ?? []).map((option, optionPosition) => ({
                  label: option.label,
                  value: option.value,
                  position: optionPosition,
                })),
              },
            })),
          },
        },
      });
      result.created.push(slug);
    }
    return result;
  });
}
