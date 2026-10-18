// Blog post gallery media — references media_files rows (primary key:
// galleryId + mediaId). Uses stable demo media ids; ensure media seed exists
// or adjust ids to existing media files.
export default [
  { galleryId: "ea000000-0000-0000-0000-000000000001", mediaId: "aaaaaaaa-0000-0000-0000-000000000001", altText: "Canaux d'Annecy", caption: "Les canaux en centre-ville", sortOrder: 1 },
  { galleryId: "ea000000-0000-0000-0000-000000000001", mediaId: "aaaaaaaa-0000-0000-0000-000000000002", altText: "Bord du lac", caption: "Le lac depuis la promenade", sortOrder: 2 },
];
