import type { EmailType, Role } from "@/lib/api/client";

// GOW selection mail only goes to owners and admins, so members never see that toggle.
export const emailTypesFor = (types: Record<EmailType, string>, role: Role) =>
  (Object.keys(types) as EmailType[]).filter((t) => t !== "gowAdmin" || role !== "member");
