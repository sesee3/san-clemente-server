import axios from "axios";
import * as cheerio from "cheerio";
import {connectToDatabase as database} from "../config/database.config.js";

export async function getLectures(url) {
    try {
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);

        const db = await database();
        const collection = db.collection("lectures"); // collezione dove salvare

        const results = {};

        $("h2").each((_, element) => {
            const section = $(element).text().trim();

            // Filter out empty or irrelevant sections
            if (!section || section === "Conferenza Episcopale Italiana") {
                return;
            }

            const key = section.toLowerCase().replace(/\s+/g, "_");

            // Get the closest following h3 subtitle (if any)
            let subtitle = "";
            let nextElem = $(element).next();
            while (nextElem.length) {
                if (nextElem.is("h3")) {
                    subtitle = nextElem.text().trim();
                    break;
                }
                nextElem = nextElem.next();
            }

            // Get the closest following div.cci-liturgia-giorno-section-content (even if there are nodes in between)
            let contentDiv = $(element).next();
            while (contentDiv.length) {
                if (contentDiv.is("div.cci-liturgia-giorno-section-content")) {
                    break;
                }
                contentDiv = contentDiv.next();
            }

            // Function to extract text from a node, replacing <br> with spaces and including nested tags like <p>, <span>, <a>
            function extractText(node) {
                let text = "";
                node.contents().each((_, child) => {
                    if (child.type === "text") {
                        text += $(child).text();
                    } else if (child.type === "tag") {
                        if (child.name === "br") {
                            text += " ";
                        } else {
                            text += extractText($(child));
                        }
                    }
                });
                return text;
            }

            let rawText = "";
            if (contentDiv.length) {
                rawText = extractText(contentDiv);
            }

            // Clean multiple spaces and empty lines
            let text = rawText.replace(/\s+/g, " ").trim();

            results[key] = {
                content: {
                    subtitle: subtitle,
                    text: text,
                }
            };
        });
        return results;

    } catch (error) {
        console.error("Errore scraping liturgia:", error);
        return null;
    }
}

//VARIANTE
export async function getLecturesAsArray(url) {
    try {
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);

        const results = {};

        $("h2").each((_, element) => {
            const section = $(element).text().trim();

            if (!section || section === "Conferenza Episcopale Italiana") return;

            const key = section.toLowerCase().replace(/\s+/g, "_");

            // Trova il sottotitolo più vicino (h3)
            let subtitle = "";
            let nextElem = $(element).next();
            while (nextElem.length) {
                if (nextElem.is("h3")) {
                    subtitle = nextElem.text().trim();
                    break;
                }
                nextElem = nextElem.next();
            }

            // Trova il div della sezione
            let contentDiv = $(element).next();
            while (contentDiv.length) {
                if (contentDiv.is("div.cci-liturgia-giorno-section-content")) {
                    break;
                }
                contentDiv = contentDiv.next();
            }

            const paragraphs = [];

            function extractParagraphs(node) {
                node.contents().each((_, child) => {
                    if (child.type === "text") {
                        const t = $(child).text().trim();
                        if (t) paragraphs.push(t);
                    } else if (child.type === "tag") {
                        if (child.name === "br") {
                            // Aggiungi uno spazio se necessario
                            if (paragraphs.length) paragraphs[paragraphs.length - 1] += " ";
                        } else if (child.name === "p") {
                            const pText = $(child).text().replace(/<br\s*\/?>/gi, " ").trim();
                            if (pText) paragraphs.push(pText);
                            extractParagraphs($(child)); // ricorsione per eventuali <p> annidati
                        } else {
                            extractParagraphs($(child));
                        }
                    }
                });
            }

            if (contentDiv.length) {
                extractParagraphs(contentDiv);
            }

            results[key] = {
                content: {
                    subtitle,
                    paragraphs
                }
            };
        });

        console.log(results);
        return results;

    } catch (error) {
        console.error("Errore scraping liturgia:", error);
        return null;
    }
}