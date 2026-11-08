// Notifications de démonstration — table partagée `notifications` (N1-A) :
// module blog (cible = article) et module services (cible = service).
import { notificationRow } from "@/core/notifications";

const legacyBlogNotifications = [
  {
    id: "n1000000-0000-0000-0000-000000000001",
    userId: "11111111-1111-1111-1111-111111111111",
    organizationId: null,
    type: "NEW_COMMENT",
    postId: "e5000000-0000-0000-0000-000000000001",
    commentId: "c8000000-0000-0000-0000-000000000001",
    reviewId: null,
    fromUserId: "22222222-2222-2222-2222-222222222222",
    isRead: false,
    metadata: null,
    createdAt: new Date("2026-02-01T12:00:00.000Z"),
  },
  {
    id: "n1000000-0000-0000-0000-000000000002",
    userId: "11111111-1111-1111-1111-111111111111",
    organizationId: null,
    type: "NEW_REVIEW",
    postId: "e5000000-0000-0000-0000-000000000001",
    commentId: null,
    reviewId: "d9000000-0000-0000-0000-000000000001",
    fromUserId: "33333333-3333-3333-3333-333333333333",
    isRead: false,
    metadata: null,
    createdAt: new Date("2026-02-02T10:00:00.000Z"),
  },
  {
    id: "n1000000-0000-0000-0000-000000000003",
    userId: "22222222-2222-2222-2222-222222222222",
    organizationId: null,
    type: "COMMENT_APPROVED",
    postId: "e5000000-0000-0000-0000-000000000001",
    commentId: "c8000000-0000-0000-0000-000000000002",
    reviewId: null,
    fromUserId: "11111111-1111-1111-1111-111111111111",
    isRead: true,
    metadata: null,
    createdAt: new Date("2026-02-01T13:05:00.000Z"),
  },
];

const legacyServiceNotifications = [
  { id: "9c000000-0000-0000-0000-000000000001", recipientId: "11111111-1111-1111-1111-111111111111", actorId: "33333333-3333-3333-3333-333333333333", serviceId: "90000000-0000-0000-0000-000000000001", commentId: null, reviewId: "98000000-0000-0000-0000-000000000001", type: "NEW_REVIEW", title: "Nouvel avis", message: "Un nouvel avis a été soumis pour votre service.", readAt: null, createdAt: new Date("2026-02-25T08:00:00.000Z") },
  { id: "9c000000-0000-0000-0000-000000000002", recipientId: "11111111-1111-1111-1111-111111111111", actorId: "22222222-2222-2222-2222-222222222222", serviceId: "90000000-0000-0000-0000-000000000001", commentId: "99000000-0000-0000-0000-000000000001", reviewId: null, type: "NEW_COMMENT", title: "Nouveau commentaire", message: "Un nouveau commentaire a été soumis pour votre service.", readAt: null, createdAt: new Date("2026-02-25T08:05:00.000Z") },
  { id: "9c000000-0000-0000-0000-000000000003", recipientId: "22222222-2222-2222-2222-222222222222", actorId: "11111111-1111-1111-1111-111111111111", serviceId: "90000000-0000-0000-0000-000000000001", commentId: null, reviewId: null, type: "SERVICE_PUBLISHED", title: "Service publié", message: "Un service vient d’être publié.", readAt: new Date("2026-02-20T09:01:00.000Z"), createdAt: new Date("2026-02-20T09:00:00.000Z") },
];

const blogRows = legacyBlogNotifications.map((row) => ({
  id: row.id,
  ...notificationRow({
    userId: row.userId,
    organizationId: row.organizationId,
    module: "blog",
    type: row.type,
    actorId: row.fromUserId,
    resourceType: "post",
    resourceId: row.postId,
    data: { commentId: row.commentId, reviewId: row.reviewId, metadata: row.metadata },
  }),
  readAt: row.isRead ? row.createdAt : null,
  createdAt: row.createdAt,
}));

const serviceRows = legacyServiceNotifications.map((row) => ({
  id: row.id,
  ...notificationRow({
    userId: row.recipientId,
    organizationId: null,
    module: "services",
    type: row.type,
    actorId: row.actorId,
    resourceType: "service",
    resourceId: row.serviceId,
    data: { commentId: row.commentId, reviewId: row.reviewId },
    title: row.title,
    message: row.message,
  }),
  readAt: row.readAt,
  createdAt: row.createdAt,
}));

export default [...blogRows, ...serviceRows];
