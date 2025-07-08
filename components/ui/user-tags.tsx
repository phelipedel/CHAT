'use client';

import { Badge } from '@/components/ui/badge';
import { Shield, Star, CheckCircle, Zap } from 'lucide-react';

interface UserTagsProps {
  tags: string[];
  size?: 'sm' | 'md' | 'lg';
}

const tagConfig = {
  'ADM': {
    color: 'bg-red-600 text-white',
    icon: Shield,
    label: 'Administrador'
  },
  'Suporte': {
    color: 'bg-blue-600 text-white',
    icon: Star,
    label: 'Suporte'
  },
  'Verificado': {
    color: 'bg-green-600 text-white',
    icon: CheckCircle,
    label: 'Verificado'
  },
  'Beta': {
    color: 'bg-purple-600 text-white',
    icon: Zap,
    label: 'Beta Tester'
  }
};

export function UserTags({ tags, size = 'md' }: UserTagsProps) {
  if (!tags || tags.length === 0) return null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1'
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5'
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {tags.map((tag) => {
        const config = tagConfig[tag as keyof typeof tagConfig];
        if (!config) return null;

        const Icon = config.icon;

        return (
          <Badge
            key={tag}
            className={`${config.color} ${sizeClasses[size]} flex items-center gap-1 font-medium`}
            title={config.label}
          >
            <Icon className={iconSizes[size]} />
            {tag}
          </Badge>
        );
      })}
    </div>
  );
}