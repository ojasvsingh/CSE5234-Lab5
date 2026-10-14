import { useEffect, useRef, useState } from 'react';
import { FiArrowDown, FiArrowRight, FiDownload, FiInfo, FiLifeBuoy, FiPlus } from 'react-icons/fi';
import FormField from '../components/FormField.jsx';
import { support } from '../data/company.js';
import { createSupportPreview, emptySupportRequest, validateSupportRequest } from '../lib/support.js';

export default function Contact() {
  const [request, setRequest] = useState({ ...emptySupportRequest });
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState('');
  const previewRef = useRef(null);

  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);

  function update(event) {
    const { name, value } = event.target;
    setRequest((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setPreview('');
  }

  function chooseTopic(topic) {
    setRequest((current) => ({ ...current, topic }));
    setErrors((current) => ({ ...current, topic: undefined }));
    setPreview('');
  }

  function submit(event) {
    event.preventDefault();
    const nextErrors = validateSupportRequest(request);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(`support-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }
    setPreview(createSupportPreview(request));
  }

  function downloadPreview() {
    const url = URL.createObjectURL(new Blob([preview], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'adventure-beyond-support-preview.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function field(name) {
    return { id: `support-${name}`, value: request[name], onChange: update, error: errors[name] };
  }

  return (
    <div className="contact-page">
      <section className="container contact-hero">
        <div>
          <p className="eyebrow">CONTACT US / TRAIL SUPPORT</p>
          <h1>A helping hand,<br /><em>wherever you’re headed.</em></h1>
          <p>Questions, detours, or gear that isn’t quite right? Our {support.team} is the starting point for order help, returns, and product advice.</p>
          <a className="inline-link" href="#support-request">Prepare a support request <FiArrowDown aria-hidden="true" /></a>
        </div>
        <div className="support-emblem" aria-hidden="true"><span>ALONG FOR THE JOURNEY</span><FiLifeBuoy /><span>ADVENTURE BEYOND</span></div>
      </section>

      <section className="container support-topics" aria-label="Choose a support team">
        {support.topics.map((topic, index) => (
          <article key={topic.id}>
            <span className="eyebrow">0{index + 1} / {topic.owner.toUpperCase()}</span>
            <h2>{topic.title}</h2>
            <p>{topic.description}</p>
            <a className="inline-link" href="#support-request" onClick={() => chooseTopic(topic.id)}>Get help with {topic.id === 'order' ? 'an order' : topic.id === 'return' ? 'a return' : 'a product'} <FiArrowRight aria-hidden="true" /></a>
          </article>
        ))}
      </section>

      <section className="container support-grid" id="support-request" aria-labelledby="request-title">
        <div className="support-form-column">
          <p className="eyebrow">LET’S GET YOU POINTED IN THE RIGHT DIRECTION</p>
          <h2 id="request-title">Tell us what’s on your mind.</h2>
          <p className="support-intro">Choose a topic and describe what you need. An order number helps if your question is about a purchase.</p>
          <div className="demo-note"><FiInfo aria-hidden="true" /><p>This demo prepares a request preview only. Nothing is sent, and the example inbox is not monitored. Use sample contact details.</p></div>

          <form className="support-form" noValidate onSubmit={submit}>
            <div className="form-row">
              <FormField name="name" label="Your name" {...field('name')} autoComplete="name" placeholder="Alex Taylor" maxLength={100} />
              <FormField name="email" label="Email address" {...field('email')} type="email" autoComplete="email" placeholder="alex@example.com" maxLength={254} />
            </div>
            <FormField name="topic" label="How can we help?" {...field('topic')}>
              <option value="">Choose a topic</option>
              {support.topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}
            </FormField>
            <FormField name="orderNumber" label="Order number" {...field('orderNumber')} optional placeholder="AB-1234ABCD" maxLength={11} hint="You can leave this blank for a general product question." />
            <FormField name="message" label="Your message" {...field('message')} multiline rows={5} minLength={10} maxLength={2000} placeholder="Tell us which item or order you need help with, and what happened." hint="Please leave out payment details and other sensitive information." />
            <button type="submit" className="button button-primary full-width">Preview support request <FiArrowRight aria-hidden="true" /></button>
          </form>

          {preview && (
            <section className="support-preview" aria-labelledby="preview-title" ref={previewRef} tabIndex="-1">
              <p className="eyebrow">READY TO REVIEW</p>
              <h3 id="preview-title">Your request preview</h3>
              <p role="status">This request has not been sent. You can download a copy for your demo.</p>
              <pre>{preview}</pre>
              <button className="button button-primary" type="button" onClick={downloadPreview}>Download preview <FiDownload aria-hidden="true" /></button>
            </section>
          )}
        </div>

        <aside className="support-aside">
          <div className="support-contact">
            <FiLifeBuoy aria-hidden="true" />
            <p className="eyebrow">WHO TO CONTACT</p>
            <h2>{support.team}</h2>
            <p>Order support handles purchase questions. Returns support handles returns and damaged items. Gear support helps with product questions.</p>
            <span className="support-email">{support.email}</span>
            <small>Example address only · not a working inbox</small>
          </div>
          <section className="return-policy" id="returns" aria-labelledby="returns-title">
            <p className="eyebrow">THE WAY BACK</p>
            <h2 id="returns-title">Returns & support policy</h2>
            <p className="policy-note">Example policies for this student store. No real purchases, refunds, or returns take place.</p>
            {support.policies.map((policy) => <div className="policy-item" key={policy.title}><h3>{policy.title}</h3><p>{policy.description}</p></div>)}
          </section>
        </aside>
      </section>

      <section className="faq-band" id="faq">
        <div className="container faq-grid">
          <div><p className="eyebrow">A FEW USEFUL ANSWERS</p><h2>Before you<br /><em>hit the trail.</em></h2><p>Quick answers about your bag, your order, and this demo storefront.</p></div>
          <div className="faq-list" aria-label="Frequently asked questions">
            {support.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}<FiPlus aria-hidden="true" /></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
