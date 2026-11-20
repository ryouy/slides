import { expect, test } from '@playwright/test';

test('a painting can be starred while playing; the gallery lists the starred ones and marks them; it is remembered', async ({ page }) => {
  await page.goto('/art-slide/play/monet-water-lilies');
  const star = page.getByTestId('favorite-toggle');
  await expect(star).toBeVisible();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  // remembered after a reload
  await page.reload();
  await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true');

  // star a second painting
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await page.getByTestId('favorite-toggle').click();

  // the gallery marks starred paintings and can show only those
  await page.goto('/art-slide/gallery');
  await expect(page.locator('.g-fav')).toHaveCount(0); // the first group (landscapes) holds none of the starred paintings
  await page.getByTestId('gal-fav').click();
  await expect(page.getByTestId('fav-monet-water-lilies')).toBeVisible(); // the star mark sits on the starred paintings
  await expect(page.getByTestId('gal-fav')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gal-fav-count')).toContainText('2');
  await expect(page.getByTestId('art-monet-water-lilies')).toBeVisible();
  await expect(page.getByTestId('art-van-gogh-bedroom')).toBeVisible();
  await expect(page.getByTestId('art-hokusai-great-wave')).toHaveCount(0);

  // un-star one: it leaves the list
  await page.goto('/art-slide/play/monet-water-lilies');
  await page.getByTestId('favorite-toggle').click();
  await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/art-slide/gallery');
  await page.getByTestId('gal-fav').click();
  await expect(page.getByTestId('gal-fav-count')).toContainText('1');
  await expect(page.getByTestId('art-monet-water-lilies')).toHaveCount(0);
});

test('with no favourites the star filter says so', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  await page.getByTestId('gal-fav').click();
  await expect(page.getByTestId('gal-fav-empty')).toBeVisible();
  await page.getByTestId('gal-fav').click(); // back to the normal gallery
  await expect(page.getByTestId('gallery').locator('.gcard').first()).toBeVisible();
});
