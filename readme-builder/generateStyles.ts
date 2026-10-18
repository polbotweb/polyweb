import { PATHS, readFile } from './utils';
import type { Lang } from './i18n';
import path from 'path';

/**
 * Génère la documentation des tokens et styles CSS
 */
export async function generateStyles(lang: Lang, t: any): Promise<string> {
  let out = `## ${t.sections.styles[lang]}\n\n`;
  
  const stylesPath = path.resolve(PATHS.root, 'src/styles');
  const tokensPath = path.resolve(stylesPath, 'tokens');
  const componentsPath = path.resolve(stylesPath, 'components');
  
  // Tokens CSS
  out += `### ${t.subsections.tokens[lang]}\n\n`;
  
  const tokenFiles = ['colors.css', 'spacing.css', 'typography.css', 'components.css'];
  for (const file of tokenFiles) {
    const content = await readFile(path.join(tokensPath, file));
    if (content) {
      out += `#### ${file.replace('.css', '').charAt(0).toUpperCase() + file.replace('.css', '').slice(1)}\n\n`;
      
      // Extrait les variables CSS
      const cssVars = content.match(/--[a-zA-Z0-9-]+:/g);
      if (cssVars && cssVars.length > 0) {
        const uniqueVars = [...new Set(cssVars.map(v => v.replace(':', '')))];
        out += `${lang === 'en' ? 'Variables' : lang === 'fr' ? 'Variables' : lang === 'ar' ? 'المتغيرات' : 'Variables'}: \`${uniqueVars.length}\`\n\n`;
        
        // Affiche les premières variables comme exemple
        const sampleVars = uniqueVars.slice(0, 5);
        out += '```css\n';
        for (const varName of sampleVars) {
          const varLine = content.split('\n').find(l => l.includes(varName + ':'));
          if (varLine) {
            out += varLine.trim() + '\n';
          }
        }
        if (uniqueVars.length > 5) {
          out += `/* ... ${uniqueVars.length - 5} ${lang === 'en' ? 'more variables' : lang === 'fr' ? 'autres variables' : lang === 'ar' ? 'متغيرات أخرى' : 'más variables'} */\n`;
        }
        out += '```\n\n';
      }
    }
  }
  
  // Composants de styles
  out += `### ${t.subsections.styleComponents[lang]}\n\n`;
  
  const componentStyles = ['initial.css', 'modern.css', 'retro.css', 'futuristic.css'];
  out += lang === 'en' ? 'Available style themes:\n\n' :
         lang === 'fr' ? 'Thèmes de styles disponibles :\n\n' :
         lang === 'ar' ? 'سمات الأنماط المتاحة:\n\n' :
         'Temas de estilos disponibles:\n\n';
  
  for (const file of componentStyles) {
    const content = await readFile(path.join(componentsPath, file));
    if (content) {
      const themeName = file.replace('.css', '');
      out += `- **${themeName.charAt(0).toUpperCase() + themeName.slice(1)}** (\`${file}\`)\n`;
    }
  }
  
  out += '\n';
  
  // Fichiers de base
  out += `### ${t.subsections.baseStyles[lang]}\n\n`;
  
  const baseFiles = ['base.css', 'global.css'];
  for (const file of baseFiles) {
    const content = await readFile(path.join(stylesPath, file));
    if (content) {
      out += `- \`${file}\``;
    }
  }
  
  out += '\n';
  
  return out;
}
