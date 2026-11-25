export type DishCategory =
  | 'Starter'
  | 'Punjabi'
  | 'Gujarati'
  | 'Rice'
  | 'Desserts'
  | 'Drinks';

export interface PresetDish {
  id: string;
  categoryName: DishCategory;
  name: string;
  defaultPriceRupees: number;
  dietaryType: 'VEG' | 'NON_VEG';
}

export const PRESET_DISHES: PresetDish[] = [
  // Starter
  { id: 'st-1', categoryName: 'Starter', name: 'Paneer Tikka', defaultPriceRupees: 280, dietaryType: 'VEG' },
  { id: 'st-2', categoryName: 'Starter', name: 'Crispy Corn', defaultPriceRupees: 210, dietaryType: 'VEG' },
  { id: 'st-3', categoryName: 'Starter', name: 'Veg Manchurian Dry', defaultPriceRupees: 220, dietaryType: 'VEG' },
  { id: 'st-4', categoryName: 'Starter', name: 'Hara Bhara Kabab', defaultPriceRupees: 240, dietaryType: 'VEG' },
  { id: 'st-5', categoryName: 'Starter', name: 'Chilli Paneer', defaultPriceRupees: 270, dietaryType: 'VEG' },
  { id: 'st-6', categoryName: 'Starter', name: 'Tomato Soup', defaultPriceRupees: 140, dietaryType: 'VEG' },
  { id: 'st-7', categoryName: 'Starter', name: 'Chicken Tikka', defaultPriceRupees: 340, dietaryType: 'NON_VEG' },
  { id: 'st-8', categoryName: 'Starter', name: 'Tandoori Chicken (Half)', defaultPriceRupees: 360, dietaryType: 'NON_VEG' },
  { id: 'st-9', categoryName: 'Starter', name: 'Chilli Chicken', defaultPriceRupees: 320, dietaryType: 'NON_VEG' },

  // Punjabi
  { id: 'pj-1', categoryName: 'Punjabi', name: 'Paneer Butter Masala', defaultPriceRupees: 310, dietaryType: 'VEG' },
  { id: 'pj-2', categoryName: 'Punjabi', name: 'Kadai Paneer', defaultPriceRupees: 300, dietaryType: 'VEG' },
  { id: 'pj-3', categoryName: 'Punjabi', name: 'Dal Makhani', defaultPriceRupees: 260, dietaryType: 'VEG' },
  { id: 'pj-4', categoryName: 'Punjabi', name: 'Palak Paneer', defaultPriceRupees: 290, dietaryType: 'VEG' },
  { id: 'pj-5', categoryName: 'Punjabi', name: 'Chole Bhature', defaultPriceRupees: 220, dietaryType: 'VEG' },
  { id: 'pj-6', categoryName: 'Punjabi', name: 'Butter Naan', defaultPriceRupees: 60, dietaryType: 'VEG' },
  { id: 'pj-7', categoryName: 'Punjabi', name: 'Garlic Naan', defaultPriceRupees: 75, dietaryType: 'VEG' },
  { id: 'pj-8', categoryName: 'Punjabi', name: 'Butter Chicken', defaultPriceRupees: 380, dietaryType: 'NON_VEG' },
  { id: 'pj-9', categoryName: 'Punjabi', name: 'Chicken Tikka Masala', defaultPriceRupees: 360, dietaryType: 'NON_VEG' },
  { id: 'pj-10', categoryName: 'Punjabi', name: 'Mutton Rogan Josh', defaultPriceRupees: 460, dietaryType: 'NON_VEG' },

  // Gujarati
  { id: 'gj-1', categoryName: 'Gujarati', name: 'Undhiyu', defaultPriceRupees: 260, dietaryType: 'VEG' },
  { id: 'gj-2', categoryName: 'Gujarati', name: 'Sev Tameta Nu Shaak', defaultPriceRupees: 180, dietaryType: 'VEG' },
  { id: 'gj-3', categoryName: 'Gujarati', name: 'Ringan No Oro', defaultPriceRupees: 190, dietaryType: 'VEG' },
  { id: 'gj-4', categoryName: 'Gujarati', name: 'Gujarati Dal', defaultPriceRupees: 150, dietaryType: 'VEG' },
  { id: 'gj-5', categoryName: 'Gujarati', name: 'Gujarati Kadhi', defaultPriceRupees: 150, dietaryType: 'VEG' },
  { id: 'gj-6', categoryName: 'Gujarati', name: 'Khaman Dhokla', defaultPriceRupees: 120, dietaryType: 'VEG' },
  { id: 'gj-7', categoryName: 'Gujarati', name: 'Thepla (3 pcs)', defaultPriceRupees: 90, dietaryType: 'VEG' },
  { id: 'gj-8', categoryName: 'Gujarati', name: 'Rotli (Ghee)', defaultPriceRupees: 30, dietaryType: 'VEG' },
  { id: 'gj-9', categoryName: 'Gujarati', name: 'Farsan Patra', defaultPriceRupees: 130, dietaryType: 'VEG' },

  // Rice
  { id: 'rc-1', categoryName: 'Rice', name: 'Jeera Rice', defaultPriceRupees: 180, dietaryType: 'VEG' },
  { id: 'rc-2', categoryName: 'Rice', name: 'Steamed Basmati Rice', defaultPriceRupees: 140, dietaryType: 'VEG' },
  { id: 'rc-3', categoryName: 'Rice', name: 'Veg Pulao', defaultPriceRupees: 210, dietaryType: 'VEG' },
  { id: 'rc-4', categoryName: 'Rice', name: 'Veg Dum Biryani', defaultPriceRupees: 260, dietaryType: 'VEG' },
  { id: 'rc-5', categoryName: 'Rice', name: 'Khichdi Kadhi', defaultPriceRupees: 190, dietaryType: 'VEG' },
  { id: 'rc-6', categoryName: 'Rice', name: 'Chicken Dum Biryani', defaultPriceRupees: 340, dietaryType: 'NON_VEG' },
  { id: 'rc-7', categoryName: 'Rice', name: 'Mutton Biryani', defaultPriceRupees: 420, dietaryType: 'NON_VEG' },

  // Desserts
  { id: 'ds-1', categoryName: 'Desserts', name: 'Gulab Jamun (2 pcs)', defaultPriceRupees: 100, dietaryType: 'VEG' },
  { id: 'ds-2', categoryName: 'Desserts', name: 'Rasmalai', defaultPriceRupees: 130, dietaryType: 'VEG' },
  { id: 'ds-3', categoryName: 'Desserts', name: 'Moong Dal Halwa', defaultPriceRupees: 160, dietaryType: 'VEG' },
  { id: 'ds-4', categoryName: 'Desserts', name: 'Kesar Shrikhand', defaultPriceRupees: 120, dietaryType: 'VEG' },
  { id: 'ds-5', categoryName: 'Desserts', name: 'Vanilla Ice Cream', defaultPriceRupees: 90, dietaryType: 'VEG' },

  // Drinks
  { id: 'dr-1', categoryName: 'Drinks', name: 'Masala Chaas (Buttermilk)', defaultPriceRupees: 60, dietaryType: 'VEG' },
  { id: 'dr-2', categoryName: 'Drinks', name: 'Sweet Lassi', defaultPriceRupees: 110, dietaryType: 'VEG' },
  { id: 'dr-3', categoryName: 'Drinks', name: 'Masala Chai', defaultPriceRupees: 50, dietaryType: 'VEG' },
  { id: 'dr-4', categoryName: 'Drinks', name: 'Cold Coffee', defaultPriceRupees: 150, dietaryType: 'VEG' },
  { id: 'dr-5', categoryName: 'Drinks', name: 'Fresh Lime Soda', defaultPriceRupees: 90, dietaryType: 'VEG' },
  { id: 'dr-6', categoryName: 'Drinks', name: 'Mineral Water', defaultPriceRupees: 30, dietaryType: 'VEG' },
];
