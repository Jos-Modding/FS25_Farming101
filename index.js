import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { marked } from "marked";
import { JSDOM } from "jsdom";

const BASE_DIR = "./tutorials";
const MOD_DESC_PATH = "./modDesc.xml";

function generateHelpLinesXml(categories, translationEntries) {
    let xml = "  <helpLines>\n";

    for (const category of categories) {
        const icon = `icons/icon_tutorial.dds`;
        const categoryKey = `tutorial_${category.name}`;
        const categoryTitle = `$l10n_${categoryKey}`;

        // Add to translation entries
        const readableName = titleCase(category.name);
        translationEntries.push({ key: categoryKey, value: readableName });

        xml += `    <category title="${categoryTitle}" iconFilename="${icon}">\n`;

        for (const page of category.pages) {
            const pageKey = `tutorial_${category.name}_${page.fileKey}`;
            const pageTitle = `$l10n_${pageKey}`;

            translationEntries.push({
                key: pageKey,
                value: titleCase(page.fileKey.replace(/[-_]/g, " ")),
            });
            xml += `      <page title="${pageTitle}">\n`;

            let counter = 1;

            for (const paragraph of page.paragraphs) {
                xml += `        <paragraph>\n`;

                if (paragraph.title) {
                    const key = `tutorial_${category.name}_${page.fileKey}_${String(counter).padStart(3, "0")}`;
                    xml += `          <title text="$l10n_${key}"/>\n`;
                    translationEntries.push({ key, value: paragraph.title });
                    counter++;
                }

                if (paragraph.text) {
                    const key = `tutorial_${category.name}_${page.fileKey}_${String(counter).padStart(3, "0")}`;
                    xml += `          <text text="$l10n_${key}"/>\n`;
                    translationEntries.push({ key, value: paragraph.text });
                    counter++;
                }

                if (paragraph.image) {
                    xml += `          <image filename="images/${paragraph.image}" />\n`;
                }

                xml += `        </paragraph>\n`;
            }

            xml += `      </page>\n`;
        }

        xml += `    </category>\n`;
    }

    xml += "  </helpLines>";
    return xml;
}

async function buildTutorialData() {
    const categories = [];

    const categoryDirs = await readdir(BASE_DIR, { withFileTypes: true });
    for (const dirent of categoryDirs) {
        if (!dirent.isDirectory()) continue;
        const catPath = join(BASE_DIR, dirent.name);
        const files = await readdir(catPath);

        const pages = [];
        for (const file of files.filter((f) => extname(f) === ".md")) {
            const filePath = join(catPath, file);
            const markdown = await readFile(filePath, "utf-8");
            const html = marked.parse(markdown);
            const dom = new JSDOM(html);
            const document = dom.window.document;

            const paragraphs = [];
            let currentTitle = null;

            for (const el of document.body.children) {
                if (["H1", "H2"].includes(el.tagName)) {
                    currentTitle = el.textContent.trim();
                } else if (el.tagName === "P") {
                    const text = el.textContent.trim();
                    const img = el.querySelector("img");

                    if (img) {
                        // image inside <p>
                        const file = img.getAttribute("src").split("/").pop();
                        paragraphs.push({
                            ...(currentTitle && { title: currentTitle }),
                            image: file,
                        });
                    }

                    if (text && (!img || text !== img.outerHTML)) {
                        paragraphs.push({
                            ...(currentTitle && { title: currentTitle }),
                            text,
                        });
                    }

                    // Reset title after using once
                    currentTitle = null;
                } else if (el.tagName === "IMG") {
                    const file = el.getAttribute("src").split("/").pop();
                    paragraphs.push({
                        ...(currentTitle && { title: currentTitle }),
                        image: file,
                    });
                    currentTitle = null;
                }
            }

            pages.push({
                fileKey: basename(file, ".md"),
                paragraphs,
            });
        }

        categories.push({
            name: dirent.name,
            pages,
        });
    }

    return categories;
}

async function updateModDesc(helpLinesXml) {
    const original = await readFile(MOD_DESC_PATH, "utf-8");
    const updated = original.replace(
        /<helpLines>[\s\S]*?<\/helpLines>/,
        helpLinesXml,
    );
    await writeFile(MOD_DESC_PATH, updated, "utf-8");
    console.log("✅ modDesc.xml updated with new <helpLines>");
}

async function exportTranslations(translationEntries) {
    let xml = `<l10n>\n  <elements>\n`;

    for (const entry of translationEntries) {
        xml += `    <e k="${entry.key}" v="${escapeXml(entry.value)}" />\n`;
    }

    xml += `  </elements>\n</l10n>\n`;

    await writeFile("./translations/l10n_en.xml", xml, "utf-8");
    console.log("✅ Translations written to translations/l10n_en.xml");
}

function escapeXml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function titleCase(str) {
    return str
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

(async () => {
    const data = await buildTutorialData();
    const translations = [];
    const helpLinesXml = generateHelpLinesXml(data, translations);
    await updateModDesc(helpLinesXml);
    await exportTranslations(translations);
})();
