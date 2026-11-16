// Pure data (no React, no browser APIs): shared by the site and the Worker.

/**
 * 40 fixed paintings for Free: spread over every theme and era. The list never changes by itself: paintings added
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
];
const FREE = new Set(FREE_ARTWORK_IDS);

export const isFreeArtwork = (id: string): boolean => FREE.has(id);
