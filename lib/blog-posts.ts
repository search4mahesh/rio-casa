/**
 * Blog posts.
 *
 * The listing page used to hold this array privately and link each card to
 * `/blog/<slug>` — a route that did not exist, so every "Read More" 404'd.
 * The data lives here now so the listing and the article page cannot disagree
 * about which posts exist.
 *
 * NOTE: `body` is house copy written around each post's existing summary. It is
 * deliberately free of specific prices, timings and statistics — replace it with
 * the property's own words before this goes anywhere near production.
 */

/**
 * **No page reads this any more.** Posts live in `blog_posts` and are read
 * through `lib/site-content.ts`; this array is the seed source for
 * `prisma/seed-content.ts` and nothing else (B-53).
 *
 * Editing it changes what a *fresh* seed writes, not what the site serves —
 * to change a live post, edit the row.
 */
export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
  /** Paragraphs, in order. */
  body: string[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "best-things-to-do-mahabaleshwar",
    title: "10 Best Things To Do in Mahabaleshwar",
    excerpt:
      "From Venna Lake boating to strawberry picking — your complete guide to experiencing Mahabaleshwar like a local.",
    date: "May 10, 2025",
    readTime: "6 min read",
    category: "Travel Guide",
    body: [
      "Mahabaleshwar rewards visitors who slow down. The viewpoints are the headline attraction, but the town is at its best in the quiet hours around them — early mornings before the mist lifts, and late afternoons when the light softens over the valley.",
      "Venna Lake is the natural starting point. Boats run through the day and the path around the water is an easy walk, with stalls selling corn and local produce along the way. It gets busy by mid-morning, so arrive early if you would rather have the water to yourself.",
      "The viewpoints scattered around the plateau each frame the Sahyadris differently. Rather than trying to see all of them, pick two or three and give them time. Sunrise and sunset are worth planning around.",
      "Strawberry farms welcome visitors through the season, and picking your own is genuinely fun. Many farms also sell preserves and fresh cream on site.",
      "Closer to home, the market streets are good for an unhurried browse, and the surrounding trails suit a gentle walk rather than a serious hike. Ask at reception and we will point you toward whichever suits the weather that day.",
    ],
  },
  {
    slug: "mahabaleshwar-monsoon-guide",
    title: "Why Monsoon is the Best Time to Visit Mahabaleshwar",
    excerpt:
      "Everything turns lush green, the waterfalls roar, and the mist clings to the hills — discover why July–September is magical.",
    date: "April 22, 2025",
    readTime: "5 min read",
    category: "Season Guide",
    body: [
      "Monsoon transforms the plateau. The brown edges of summer disappear under new green, seasonal waterfalls appear along the ghat roads, and cloud moves through the valley at eye level.",
      "It is a quieter season than the winter peak, which is much of the appeal. Rooms are easier to come by, the viewpoints are uncrowded, and the whole place feels closer to how residents experience it.",
      "Pack for the weather rather than around it: waterproofs, footwear with grip, and something warm for the evenings. Visibility at the viewpoints comes and goes — the trick is to be unhurried enough that you are still there when the cloud parts.",
      "Driving conditions on the ghats call for care and daylight. If you are coming from Pune or Mumbai, plan to arrive before dark.",
      "Evenings are for staying in. Hot food, a window, and rain on the hills is the whole point of the season.",
    ],
  },
  {
    slug: "romantic-weekend-getaway-pune",
    title: "The Perfect Romantic Weekend Getaway from Pune",
    excerpt:
      "3-hour drive, mountain air, strawberry breakfast, candlelit dinners. Here's the Rio Casa weekend itinerary couples love.",
    date: "March 15, 2025",
    readTime: "4 min read",
    category: "Packages",
    body: [
      "Mahabaleshwar's great advantage from Pune is how little of the weekend the journey costs you. Leave after breakfast on Saturday and the afternoon is still yours.",
      "We suggest keeping the first day light — settle in, walk down to the lake, and let the altitude and air do their work. The town is best appreciated without an itinerary on the first evening.",
      "Sunday morning is worth an early start for a viewpoint before the coaches arrive. Breakfast afterwards, unhurried, is the part most couples remember.",
      "If you are marking an occasion, tell us in advance and we will arrange what we can — a quieter table, something for the room, a later check-out where the day's arrivals allow it.",
      "Drive back in the afternoon and you are home for dinner, which is the difference between a weekend away and a weekend spent travelling.",
    ],
  },
  {
    slug: "mahabaleshwar-strawberry-season",
    title: "Mahabaleshwar Strawberry Season: When & Where",
    excerpt:
      "Mahabaleshwar produces over 85% of India's strawberries. Here's everything you need to know about the season.",
    date: "February 28, 2025",
    readTime: "5 min read",
    category: "Local Guide",
    body: [
      "Strawberries are the crop Mahabaleshwar is known for, and the season shapes the town — roadside stalls, farm gates open to visitors, and the fruit turning up in everything from cream to preserves.",
      "The cool nights and mild days of the plateau are what make it work. Fruit picked the same morning tastes noticeably different from anything that has travelled, which is the main argument for eating it here.",
      "Several farms around the town let visitors pick their own. It is worth calling ahead in peak weeks, and worth going early — the best fruit does not last the day.",
      "Beyond the fresh fruit, look for preserves and crushes sold directly by the growers. They travel well and make better souvenirs than most things in the market.",
      "Ask us which farms are picking well when you visit. It varies week to week, and the people at reception generally know.",
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
