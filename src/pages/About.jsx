import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiArrowUpRight, FiCompass } from 'react-icons/fi';
import { company, teamMembers } from '../data/company.js';

function ExecutiveProfile({ member }) {
  const [failedImage, setFailedImage] = useState(null);
  const hasPortrait = Boolean(member.image) && failedImage !== member.image;
  return (
    <article className="team-card">
      <div className="team-photo">
        <img
          src={hasPortrait ? member.image : '/images/team-placeholder.svg'}
          alt={hasPortrait ? `Portrait of ${member.name}` : `Portrait not yet available for ${member.name}`}
          loading="lazy"
          width="400"
          height="440"
          onError={() => { if (hasPortrait) setFailedImage(member.image); }}
        />
        {!hasPortrait && <span>PORTRAIT TO BE ADDED</span>}
      </div>
      <p className="eyebrow team-role">{member.title || 'Role to be added'}</p>
      <h3>{member.name}</h3>
      <dl>
        <div><dt>Education</dt><dd>{member.education || 'Education details to be added.'}</dd></div>
        <div><dt>Experience</dt><dd>{member.experience || 'Experience details to be added.'}</dd></div>
        <div><dt>Outside the office</dt><dd>{member.passion || 'Interests to be added.'}</dd></div>
      </dl>
    </article>
  );
}

export default function About() {
  return (
    <>
      <section className="container about-hero">
        <div>
          <p className="eyebrow">ABOUT US / ADVENTURE BEYOND</p>
          <h1>A little curiosity.<br /><em>A lot of possibility.</em></h1>
          <p>We believe the best part of getting outside is finding your own way. Adventure Beyond is our student team’s take on a more welcoming outdoor store: a small collection, clear choices, and room for your next adventure.</p>
          <a className="inline-link" href="#executives">Meet our executives <FiArrowRight aria-hidden="true" /></a>
        </div>
        <div className="about-illustration">
          <img src="/images/trail-marker.svg" alt="A wooden trail sign pointing toward an open mountain landscape" width="560" height="460" />
          <span className="eyebrow">GOOD COMPANY. GREAT OUTDOORS.</span>
        </div>
      </section>

      <section className="container mission-grid" aria-label="Our mission and vision">
        <article><p className="eyebrow">01 / WHY WE’RE HERE</p><h2>Our mission</h2><p>{company.mission}</p></article>
        <article><p className="eyebrow">02 / WHERE WE’RE HEADED</p><h2>Our vision</h2><p>{company.vision}</p></article>
      </section>

      <section className="strategy-band" aria-labelledby="strategy-title">
        <div className="container">
          <div className="strategy-heading">
            <div><p className="eyebrow">A PRACTICAL PLAN FOR THE WAY AHEAD</p><h2 id="strategy-title">Our strategy</h2></div>
            <p>{company.strategy}</p>
          </div>
          <div className="strategy-grid">
            {company.principles.map((principle, index) => (
              <article key={principle.title}>
                <span className="strategy-number">0{index + 1}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container team-section" id="executives" aria-labelledby="executives-title">
        <div className="section-heading">
          <div><p className="eyebrow">THE PEOPLE BEHIND THE PATH</p><h2 id="executives-title">Meet our executives</h2></div>
          <span className="team-kicker">Different perspectives.<br />One shared adventure.</span>
        </div>
        {teamMembers.length > 0 ? (
          <div className="team-grid">{teamMembers.map((member) => <ExecutiveProfile member={member} key={member.id} />)}</div>
        ) : (
          <div className="team-pending">
            <img src="/images/team-placeholder.svg" alt="A placeholder silhouette awaiting a team portrait" width="180" height="198" />
            <div>
              <p className="eyebrow">INTRODUCTIONS ARE ON THE WAY</p>
              <h3>A team with a trail ahead.</h3>
              <p>Our team’s names, executive roles, photos, and individual stories will be added here. Member profiles are still awaiting those details.</p>
              <Link className="inline-link" to="/contact">Explore our support page <FiArrowUpRight aria-hidden="true" /></Link>
            </div>
          </div>
        )}
      </section>

      <section className="about-outro"><div className="container">
        <FiCompass aria-hidden="true" />
        <div><p className="eyebrow">YOUR NEXT CHAPTER STARTS OUTSIDE</p><h2>See where a little beyond takes you.</h2></div>
        <Link className="button button-primary" to="/purchase">Find your essentials <FiArrowRight aria-hidden="true" /></Link>
      </div></section>
    </>
  );
}
