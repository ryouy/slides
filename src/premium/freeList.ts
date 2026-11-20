// Pure data (no React, no browser APIs): shared by the site and the Worker.

/**
 * 75 fixed paintings for Free (the first 40 are the original list, FREE_ARTWORK_IDS_V1; 35 were added on 2026-11-20): spread over every theme and era. The list never changes by itself: paintings added
 * to the collection later are NOT in it, so they belong to Premium (which has every painting, present and future).
 */
export const FREE_ARTWORK_IDS: readonly string[] = [
  'bierstadt-mountain-brook', // Albert Bierstadt · Landscape · 1850–1879
  'chase-wind-swept-sands', // William Merritt Chase · Landscape · 1880–1899
  'cole-distant-view-of-niagara-falls', // Thomas Cole · Landscape · 1800–1849
  'lorrain-view-of-delphi-with-a-procession', // Claude Lorrain · Landscape · Before 1700
  'cezanne-auvers-panoramic-view', // Paul Cézanne · Landscape · 1850–1879
  'constable-stoke-by-nayland', // John Constable · Landscape · 1800–1849
  'guardi-the-grand-canal-venice', // Francesco Guardi · Sea & Water · 1700s
  'monet-water-lilies', // Claude Monet · Sea & Water · 1900s
  'gogh-fishing-in-spring-the-pont-de-clichy-asnieres', // Vincent van Gogh · Sea & Water · 1880–1899
  'sorolla-rocks-at-the-lighthouse-biarritz', // Joaquín Sorolla · Sea & Water · 1900s
  'vermeer-water-pitcher', // Johannes Vermeer · People & Daily Life · Before 1700
  'cassatt-childs-bath', // Mary Cassatt · People & Daily Life · 1880–1899
  'degas-dance-class', // Edgar Degas · People & Daily Life · 1850–1879
  'sargent-the-fountain-villa-torlonia-frascati-italy', // John Singer Sargent · People & Daily Life · 1900s
  'van-gogh-bedroom', // Vincent van Gogh · People & Daily Life · 1880–1899
  'copley-daniel-hubbard', // John Singleton Copley · Portrait · 1700s
  'sargent-madame-x', // John Singer Sargent · Portrait · 1880–1899
  'hals-portrait-of-a-lady', // Frans Hals · Portrait · Before 1700
  'ingres-amedee-david-the-comte-de-pastoret', // Jean-Auguste-Dominique Ingres · Portrait · 1800–1849
  'corot-interrupted-reading', // Camille Corot · Portrait · 1850–1879
  'bellotto-view-of-pirna-with-the-fortress-of-sonnenstein', // Bernardo Bellotto · City & Street · 1700s
  'hassam-new-york-street', // Childe Hassam · City & Street · 1900s
  'caillebotte-paris-street', // Gustave Caillebotte · City & Street · 1850–1879
  'fantin-latour-roses-in-a-bowl', // Henri Fantin-Latour · Still Life & Flowers · 1880–1899
  'redon-still-life-with-flowers', // Odilon Redon · Still Life & Flowers · 1900s
  'harnett-just-dessert', // William Michael Harnett · Still Life & Flowers · 1880–1899
  'poussin-landscape-with-saint-john-on-patmos', // Nicolas Poussin · Myth & Religion · Before 1700
  'hiroshige-arai', // Utagawa Hiroshige · Japanese Prints · 1800–1849
  'hokusai-great-wave', // Katsushika Hokusai · Japanese Prints · 1800–1849
  'hokusai-shower-below-the-summit', // Katsushika Hokusai · Japanese Prints · 1800–1849
  'aic-217536', // Neapolitan · Myth & Religion · 1700s
  'aic-105073', // Giovanni Benedetto Castiglione · Myth & Religion · Before 1700
  'aic-111559', // Francisco José de Goya y Lucientes · Still Life & Flowers · 1700s
  'aic-105466', // Joachim Antonisz. Wtewael · Myth & Religion · Before 1700
  'aic-13405', // Kitagawa Utamaro · City & Street · 1700s
  'hiroshige-mishima-morning-mist', // Utagawa Hiroshige · Japanese Prints · 1800–1849
  'aic-100489', // William Bradford · Sea & Water · 1850–1879
  'aic-14310', // Paula Modersohn-Becker · Still Life & Flowers · 1900s
  'aic-110881', // Master of the Housebook · Myth & Religion · Before 1700
  'aic-61603', // Hilaire Germain Edgar Degas · City & Street · 1850–1879
  'church-view-of-cotopaxi', // Frederic Edwin Church · Landscape · 1850–1879
  'inness-early-morning-tarpon-springs', // George Inness · Landscape · 1880–1899
  'ruisdael-landscape-with-the-ruins-of-the-castle-of-egmon', // Jacob van Ruisdael · Landscape · Before 1700
  'aic-110663', // Eugène Delacroix · Landscape · 1800–1849
  'aic-64476', // George Gardner Symons · Landscape · 1900s
  'courbet-the-rock-of-hautepierre', // Gustave Courbet · Landscape · 1850–1879
  'homer-the-herring-net', // Winslow Homer · Sea & Water · 1880–1899
  'jongkind-entrance-to-the-port-of-honfleur', // Johan Barthold Jongkind · Sea & Water · 1850–1879
  'turner-fishing-boats-with-hucksters-bargaining-for-fish', // J.M.W. Turner · Sea & Water · 1800–1849
  'aic-109780', // George Wesley Bellows · Sea & Water · 1900s
  'aic-110766', // Adamo Scultori · Sea & Water · Before 1700
  'gauguin-arlesiennes-mistral', // Paul Gauguin · People & Daily Life · 1880–1899
  'millet-peasants-bringing-home-a-calf-born-in-the-fields', // Jean-François Millet · People & Daily Life · 1850–1879
  'aic-109819', // Piet Mondrian · People & Daily Life · 1900s
  'aic-111', // Gérard Edelinck · People & Daily Life · 1800–1849
  'aic-12764', // Katsukawa Shunsho · People & Daily Life · 1700s
  'david-madame-de-pastoret-and-her-son', // Jacques-Louis David · Portrait · 1700s
  'eakins-riter-fitzgerald', // Thomas Eakins · Portrait · 1880–1899
  'henri-himself', // Robert Henri · Portrait · 1900s
  'rembrandt-aristotle-homer', // Rembrandt van Rijn · Portrait · Before 1700
  'aic-11', // Walter Shirlaw · Portrait · 1850–1879
  'panini-festival-in-piazza-navona', // Giovanni Paolo Panini · City & Street · 1700s
  'pissarro-the-crystal-palace', // Camille Pissarro · City & Street · 1850–1879
  'rousseau-sawmill-outskirts-of-paris', // Henri Rousseau · City & Street · 1880–1899
  'heade-magnolias-on-light-blue-velvet-cloth', // Martin Johnson Heade · Still Life & Flowers · 1880–1899
  'aic-111059', // Juan de Zurbarán · Still Life & Flowers · Before 1700
  'aic-120154', // Raphaelle Peale · Still Life & Flowers · 1800–1849
  'aic-131407', // John F. Francis · Still Life & Flowers · 1850–1879
  'aic-19966', // Suzuki Harunobu · Still Life & Flowers · 1700s
  'rubens-the-holy-family-with-saints-elizabeth-and-john-th', // Peter Paul Rubens · Myth & Religion · Before 1700
  'aic-110507', // Arnold Böcklin · Myth & Religion · 1880–1899
  'aic-16499', // Édouard Manet · Myth & Religion · 1850–1879
  'aic-50276', // Caspar David Friedrich · Myth & Religion · 1800–1849
  'hiroshige-mitsuke-ferries-crossing-the-tenryu-river', // Utagawa Hiroshige · Japanese Prints · 1800–1849
  'hokusai-hara', // Katsushika Hokusai · Japanese Prints · 1800–1849
];
const FREE = new Set(FREE_ARTWORK_IDS);

export const isFreeArtwork = (id: string): boolean => FREE.has(id);

/** The original 40: the iOS daily pool of 2026-11-01 is frozen on exactly these (see dailyPickIos.ts). */
export const FREE_ARTWORK_IDS_V1: readonly string[] = FREE_ARTWORK_IDS.slice(0, 40);
