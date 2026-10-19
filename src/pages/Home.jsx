import { Link } from 'react-router-dom';
import { FiArrowRight, FiArrowUpRight, FiCompass, FiMap, FiSun } from 'react-icons/fi';
import { products } from '../data/products.js';
import { formatMoney } from '../lib/shop.js';

const featuredIds = ['ridge-daypack', 'summit-tent', 'camp-bottle'];

export default function Home() {
  const featured = products.filter((product) => featuredIds.includes(product.id));

  return (
    <>
      <section className="container hero home-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-dash" /> A LITTLE FURTHER. A LITTLE WILDER.</p>
          <h1>Take the long<br /><em>way home.</em></h1>
          <p>Good gear for fresh air, quiet trails, and the days<br className="desktop-break" /> you wish would last a little longer.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/purchase">Explore the collection <FiArrowRight aria-hidden="true" /></Link>
            <Link className="inline-link" to="/about">Our story <FiArrowUpRight aria-hidden="true" /></Link>
          </div>
          <div className="hero-note"><FiCompass className="home-compass" aria-hidden="true" /><span>FIVE ESSENTIALS.<br /><strong>YOUR OWN WAY OUT THERE.</strong></span></div>
        </div>
        <div className="hero-art">
          <img src="/images/landscape.svg" alt="A mountain campsite with pine trees, an orange tent, and a winding trail" width="720" height="520" />
          <span className="hero-art-label">THERE’S MORE AROUND THE NEXT BEND.</span>
          <span className="hero-art-index">ADVENTURE BEYOND / FIELD NOTES</span>
          <div className="hero-stamp">TAKE THE<br /><strong>SCENIC</strong><br />ROUTE <FiArrowUpRight aria-hidden="true" /></div>
        </div>
      </section>

      <section className="home-intro-band">
        <div className="container home-intro">
          <p className="eyebrow">LESS TO PACK.<br />MORE TO EXPLORE.</p>
          <p>A day on a familiar trail. A night under a new sky.<br />You bring the curiosity. We’ll help with the essentials.</p>
          <FiSun aria-hidden="true" />
        </div>
      </section>

      <section className="container home-collection" aria-labelledby="home-collection-title">
        <div className="section-heading">
          <div><p className="eyebrow">START WITH THE GOOD STUFF</p><h2 id="home-collection-title">A few favorites for the way out.</h2></div>
          <Link className="inline-link" to="/purchase">Shop all five essentials <FiArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="featured-grid">
          {featured.map((product, index) => (
            <Link className="featured-product" to={`/purchase#${product.id}`} key={product.id}>
              <div className={`featured-image product-image-${product.id}`}>
                <span className="eyebrow">0{index + 1} / {product.category.toUpperCase()}</span>
                <img src={product.image} alt={product.name} width="400" height="400" loading="lazy" />
                <span className="featured-arrow"><FiArrowUpRight aria-hidden="true" /></span>
              </div>
              <div className="featured-title"><h3>{product.name}</h3><span>{formatMoney(product.priceCents)}</span></div>
              <p>{product.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container home-story" aria-labelledby="home-story-title">
        <div className="story-mark" aria-hidden="true"><FiMap /><span>GO WITH CURIOSITY.</span></div>
        <div>
          <p className="eyebrow">A SMALL COLLECTION. A BIG OUTSIDE.</p>
          <h2 id="home-story-title">Adventure starts<br />with an open door.</h2>
          <p>We’re building a welcoming place to discover hiking and camping gear. Our idea is simple: make choosing your essentials as enjoyable as planning where to take them.</p>
          <Link className="inline-link" to="/about">Meet Adventure Beyond <FiArrowRight aria-hidden="true" /></Link>
        </div>
        <aside>
          <FiCompass aria-hidden="true" />
          <h3>Along for the journey.</h3>
          <p>Questions about your gear or a demo order? Find order help, return information, and answers in one place.</p>
          <Link className="inline-link" to="/contact">Visit Trail Support <FiArrowRight aria-hidden="true" /></Link>
        </aside>
      </section>
    </>
  );
}
