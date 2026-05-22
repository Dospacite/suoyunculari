# CMS Guide

## Homepage Background

The homepage hero background is editable in Directus.

1. Open **Homepage Sections**.
2. Open or create the item with `section_key` set to `hero`.
3. Set **Image** to the desired background image.
4. Optional: edit **Heading** and **Subheading** for the hero text.
5. Make sure **Is Visible** is enabled.

If the `hero` item has no image, the site falls back to `public/images/theatre-hero.png`.

## Metin Bankası References From Oyunlarımız

The **Plays** collection is the public production page in **Oyunlarımız**. It can point to one script record in **Metin Bankası**.

To mark a text-bank play as already performed, edit the matching item in **Plays**:

1. Set **Text Bank Source ID** only.
2. Use any of these formats:

```text
2248
concord:2248
concord_theatricals:2248
https://www.concordtheatricals.com/p/2248/master-haroldand-the-boys
drama:<tocid>
drama_online_library:<tocid>
https://www.dramaonlinelibrary.com/...?...tocid=<tocid>
```

For bare numeric IDs, the site assumes Concord. The site infers the source, source ID, and source URL from this field.

Referenced text-bank records are filterable in **Metin Bankası** and display `★ Oynandı`.

## Sahnelemeler

Use **Plays** for information shared by every staging of the same production, including **Director** and **Cast**.

Use **Stagings** only for performance-specific information under a play.

1. Open **Stagings**.
2. Create a staging record.
3. Set **Play** to the parent item from **Plays**.
4. Fill **Title**, **Slug**, **Date**, **Venue**, **Summary**, and **Production Notes**.
5. Optional: set **Ticket URL** and **Cover Image**.
6. Enable **Is Published**.

Each published staging appears on the parent play detail page with date, time, and venue. The staging detail page is available at:

```text
/plays/<play-slug>/stagings/<staging-slug>
```

To add photos:

1. Open the staging record.
2. Add items under **Photos**.
3. Set **Image**, optional **Caption**, **Alt Text**, and **Sort Order**.

The homepage "Yaklaşan Oyunlar" cards still link to the parent play page. That page now shows staging information first, then links to the script detail.

## Blog References

Blog posts can link to staged plays, library books, and text-bank records.

For staged plays:

1. Open a **Blog Posts** item.
2. Use **Related Plays** to select one or more records from **Oyunlarımız**.

For text-bank records:

1. Open a **Blog Posts** item.
2. Add entries under **Text Bank References**.
3. Fill **Source**, **Source ID**, **Title**, and optionally **Source URL**.

Related blog posts appear on the matching play detail page and text-bank detail page.

For library books:

1. Open a **Blog Posts** item.
2. Use **Related Books** to select one or more records from **Kütüphane**.

Related books appear on the blog detail page.

## Kütüphane

Use **Books** for the physical library.

1. Open **Books**.
2. Fill **Title**, **Slug**, **Author**, optional **Translator**, **Publisher**, **Publication Year**, **Category**, **Language**, **Location**, **Notes**, and **Tags**.
3. Use **Is Available** to mark whether the book is currently on the shelf.
4. Enable **Is Published**.

Published books appear at `/kutuphane` and can be filtered by search, category, language, and availability.

## Contact Page

Use **Contact Items** for public contact details.

1. Open **Contact Items**.
2. Add one item per visible contact method, such as email, address, Instagram, YouTube, phone, or website.
3. Fill **Label**, **Value**, **Type**, optional **Href**, and **Sort Order**.
4. Enable **Is Visible**.

For email, use `mailto:contact@suoyunculari.com` as **Href**. For future phone numbers, add a new item with type `phone` and a `tel:` href.

The map uses the visible `address` item by default. To override the embedded map URL, add a visible item with type `map` and put the Google Maps embed URL in **Href**.
