import art from "./base-art.json";
export const BASE_ART = art;
export type BaseArt = (typeof art)[number];
export const baseArtById = new Map(BASE_ART.map((a) => [a.id, a]));
