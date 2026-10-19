export const company = {
  mission: 'Make getting outside feel simple. We bring practical hiking and camping essentials together in one welcoming place, so more people can take their first step onto the trail.',
  vision: 'A world where adventure feels close to home, and a walk in the woods can become the beginning of something bigger.',
  strategy: 'Start with a focused collection of five essentials. Explain each product clearly, keep prices easy to understand, and make the journey from choosing gear to getting help straightforward.',
  principles: [
    {
      title: 'Choose with purpose',
      description: 'Keep the collection small and useful: a pack, shelter, a layer, a steady step, and something to sip from.',
    },
    {
      title: 'Keep the first step easy',
      description: 'Use clear product information, visible prices, and a checkout that lets customers review every detail.',
    },
    {
      title: 'Stay along for the journey',
      description: 'Make product questions, order help, and return information easy to find after checkout, too.',
    },
  ],
};

// Our group has three members. 

export const teamMembers = [
  {
    id: 'haotian-luo',
    name: 'Haotian Luo',
    title: 'Chief Technology Officer (CTO)',
    education: 'Computer science background, with a focus on distributed systems, web development, and software engineering.',
    experience: 'Leads the technology behind Adventure Beyond, bringing product browsing, cart management, and checkout together in one easy-to-use storefront. Enjoys building clear interfaces and solving practical engineering problems.',
    passion: 'Exploring new hiking trails, photography, and finding simple ways to make technology more useful in everyday life.',
    image: '/images/team/haotian-luo.jpg',
  },
  {
    id: 'sai-chappidi',
    name: 'Sai Chappidi',
    title: 'Head of Platform',
    education: 'Pursuing a Bachelor of Science in Computer Science and Engineering with a focus on software engineering, web development, and security.',
    experience: 'Oversees the platform architecture and technical execution behind the web storefront of Adventure Beyond, streamlining catalog browsing, shopping cart workflows, and checkout operations into a cohesive experience.',
    passion: 'Deep-dive music production analysis across varied genres, competitive strategy and data-driven sports modeling, and experimenting with precision scratch cooking.',
    image: '/images/team/Sai_Chappidi.png',
  },
  {
    id: 'ojasv-singh',
    name: 'Ojasv Singh',
    title: 'Head of Operations and Design',
    education: 'Bachelors in Computer Science, with experience in user-centered design, product development, and technology operations.',
    experience: 'Leads operations and design for Adventure Beyond, coordinating the workflows behind the storefront, while shaping a clear, intuitive shopping experience from product browsing through checkout.',
    passion: 'Exploring the outdoors, and connecting technology with people to promote more nature enthusiasts and outdoor adventurers.',
    image: '/images/team/ojasv_singh.png',
  },
];

// Reserved example address: this classroom storefront has no monitored inbox.
export const support = {
  team: 'Trail Support team',
  email: 'support@adventurebeyond.example',
  topics: [
    {
      id: 'order',
      title: 'Order questions',
      description: 'Need to check an order or correct a detail? Have your confirmation number handy.',
      owner: 'Order support',
    },
    {
      id: 'return',
      title: 'Returns & exchanges',
      description: 'Something not quite right? Tell us which item you need help with and why.',
      owner: 'Returns support',
    },
    {
      id: 'product',
      title: 'Product help',
      description: 'Choosing a trail companion or caring for your gear? Start with your product question.',
      owner: 'Gear support',
    },
  ],
  policies: [
    {
      title: 'A 30-day return window',
      description: 'Under this example policy, unused gear in its original packaging could be returned within 30 days of delivery.',
    },
    {
      title: 'Talk to us before returning gear',
      description: 'Include your order number, the item, and the reason for the return. Wait for return instructions before mailing anything.',
    },
    {
      title: 'Wrong or damaged item?',
      description: 'Report the issue within 7 days of delivery. Include the order number and a description of the problem; keep photos available for follow-up.',
    },
  ],
  faqs: [
    {
      question: 'Is this a real store?',
      answer: 'Adventure Beyond is a student storefront. You can explore the shopping and support flows, but no card is charged, no products are shipped, and support requests are not sent.',
    },
    {
      question: 'Where can I find my confirmation number?',
      answer: 'After placing a demo order, the confirmation page shows a number beginning with AB-. That receipt remains available when you refresh the confirmation page in the same tab.',
    },
    {
      question: 'Can I change an item before placing an order?',
      answer: 'Yes. Open your bag from any page to change quantities or remove items. On the review page, you can also edit your payment and shipping details before confirming.',
    },
    {
      question: 'How would I request a return or report a problem?',
      answer: 'Choose Returns & exchanges below and describe the item and issue. Include a confirmation number if you have one. This demo creates a request preview so you can check what information a support team would need.',
    },
    {
      question: 'Why did my payment details disappear after a refresh?',
      answer: 'The cart is saved in your browser tab, but card and shipping information stay only in memory. Refreshing checkout clears those details, so you need to enter them again.',
    },
    {
      question: 'Will anyone receive the support request?',
      answer: 'No. Previewing a request does not send an email or create a support ticket. The example email address is not monitored. You can download the preview as a text file for your demo.',
    },
  ],
};
