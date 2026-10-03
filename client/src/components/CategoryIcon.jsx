import React from 'react';
import {
  ShoppingCart,
  Car,
  Home,
  Gamepad2,
  HeartPulse,
  Shirt,
  BookOpen,
  Utensils,
  Repeat,
  Package,
  Tag,
  Coffee,
  Gift,
  Plane,
  Music,
  Smartphone,
  Zap,
  Droplet,
  Dumbbell,
  GraduationCap,
  Wrench,
  Beef,
  Fish,
  Apple,
  Wallet,
  Landmark,
  Briefcase,
  Smile,
  Bus,
} from 'lucide-react';

const ICON_COMPONENTS = {
  'shopping-cart': ShoppingCart,
  'cart': ShoppingCart,
  'beef': Beef,
  'meat': Beef,
  'fish': Fish,
  'apple': Apple,
  'fruits': Apple,
  'car': Car,
  'transport': Car,
  'bus': Bus,
  'home': Home,
  'logement': Home,
  'maison': Home,
  'gamepad-2': Gamepad2,
  'loisirs': Gamepad2,
  'heart-pulse': HeartPulse,
  'sante': HeartPulse,
  'shirt': Shirt,
  'vetements': Shirt,
  'book-open': BookOpen,
  'education': BookOpen,
  'utensils': Utensils,
  'restauration': Utensils,
  'restaurant': Utensils,
  'repeat': Repeat,
  'abonnements': Repeat,
  'package': Package,
  'divers': Package,
  'tag': Tag,
  'coffee': Coffee,
  'gift': Gift,
  'plane': Plane,
  'music': Music,
  'smartphone': Smartphone,
  'zap': Zap,
  'droplet': Droplet,
  'dumbbell': Dumbbell,
  'graduation-cap': GraduationCap,
  'wrench': Wrench,
  'wallet': Wallet,
  'landmark': Landmark,
  'briefcase': Briefcase,
  'smile': Smile,
};

export default function CategoryIcon({ icon, size = 18, color, className = '', strokeWidth = 2 }) {
  const IconComponent = ICON_COMPONENTS[icon] || Tag;
  return (
    <IconComponent
      size={size}
      color={color}
      className={className}
      strokeWidth={strokeWidth}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}
