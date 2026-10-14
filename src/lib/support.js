import { support } from '../data/company.js';

export const emptySupportRequest = { name: '', email: '', topic: '', orderNumber: '', message: '' };

export function validateSupportRequest(request) {
  const errors = {};
  if (!request.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email.trim())) {
    errors.email = 'Enter an email address, such as alex@example.com.';
  }
  if (!support.topics.some((topic) => topic.id === request.topic)) {
    errors.topic = 'Choose the team you would like help from.';
  }
  if (request.orderNumber.trim() && !/^AB-[A-Z0-9]{8}$/i.test(request.orderNumber.trim())) {
    errors.orderNumber = 'Use the AB-XXXXXXXX number from your confirmation, or leave this blank.';
  }
  if (request.message.trim().length < 10) errors.message = 'Describe your question in at least 10 characters.';
  return errors;
}

export function createSupportPreview(request) {
  const topic = support.topics.find((item) => item.id === request.topic);
  return [
    'ADVENTURE BEYOND — SUPPORT REQUEST PREVIEW',
    'Demo only. This request has not been sent.',
    '',
    `Team: ${topic?.owner || support.team}`,
    `Example contact: ${support.email} (not monitored)`,
    `Name: ${request.name.trim()}`,
    `Email: ${request.email.trim()}`,
    `Topic: ${topic?.title || ''}`,
    `Order number: ${request.orderNumber.trim().toUpperCase() || 'Not supplied'}`,
    '',
    request.message.trim(),
  ].join('\n');
}
