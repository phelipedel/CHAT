'use client';

import { Badge } from '@/components/ui/badge';
import { Shield, Star, CheckCircle, Zap } from 'lucide-react';

interface UserTagsProps {
  tags: string[];
  size?: 'sm' | 'md';
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

export function UserTags({ tags, size = 'sm' }: UserTagsProps) {
  if (!tags || tags.length === 0) return null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1'
  };

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-0.5">
      {tags.map((tag) => {
        const config = tagConfig[tag as keyof typeof tagConfig];
        if (!config) return null;

        const Icon = config.icon;

        return (
          <Badge
            key={tag}
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white ${config.bgColor}`}
            title={config.label}
          >
            <Icon className={iconSize} />
          </Badge>
        );
      })}
    </div>
  );
}