// The rules for every game in the catalog, one file each, named after the game's id.
import { CATALOG } from '../public/games/catalog.js';

export const RULES = {};
for (const g of CATALOG) RULES[g.id] = (await import(`./${g.id}.js`)).default;
