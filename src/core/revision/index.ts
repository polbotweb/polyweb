export interface EditorialRevisionIdentity {
  readonly resourceId: string;
  readonly revisionId: string;
  readonly authorId: string;
  readonly locale?: string | null;
}

export function assertRevisionIdentity(identity: EditorialRevisionIdentity): void {
  if (!identity.resourceId.trim()) throw new Error("Revision resourceId cannot be empty");
  if (!identity.revisionId.trim()) throw new Error("Revision revisionId cannot be empty");
  if (!identity.authorId.trim()) throw new Error("Revision authorId cannot be empty");
}
