// Real beta testimonials only, with the person's agreement. Never invent one.
// The testimonials block stays hidden while this list is empty.
export interface Testimonial {
  quote: string;
  name: string;
  role?: string;
}

export const testimonials: Testimonial[] = [];
