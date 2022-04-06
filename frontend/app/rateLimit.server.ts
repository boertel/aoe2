import { db } from "./db.server";

export async function rateLimit(request, { count, minutes }) {
  const ipAddress = request.headers.get("x-forwarded-for");
  const where = {
    ipAddress,
  };

  if (ipAddress) {
    const rateLimit = await db.rateLimit.findFirst({
      where,
    });

    const diff =
      new Date().getTime() - (rateLimit?.updatedAt || new Date().getTime());
    if (rateLimit?.count > count) {
      const ms = minutes * 60 * 1000;
      if (diff <= ms) {
        throw new Response("rate limit", { status: 400 });
      } else {
        await db.rateLimit.update({
          where,
          data: {
            count: 0,
          },
        });
      }
    }
    await db.rateLimit.upsert({
      where,
      create: {
        ...where,
        count: 1,
      },
      update: {
        count: (rateLimit?.count || 0) + 1,
      },
    });
  }
}
