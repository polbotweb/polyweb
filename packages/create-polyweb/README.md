# create-polyweb

```bash
npm create polyweb@latest mon-site
# ou, sans questions :
npm create polyweb@latest mon-site -- --yes --storage r2 --search meilisearch --adapter vercel
```

Copie le modèle Polyweb (archive GitHub `polbotweb/polyweb#main` par défaut, ou `--from ./chemin`),
renomme le paquet, génère un `.env` avec des secrets aléatoires et les choix de pilotes,
initialise git et installe les dépendances (`--no-install`, `--no-git` pour s'en passer).
Écrit en TypeScript + Effect (`ScaffoldError` typée, délais, reprises du téléchargement).
