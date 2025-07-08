'use client';

import { Shield, Star, CheckCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserTagsProps {
  tags: string[];
  size?: 'sm' | 'md';
}

const tagConfig: { [key: string]: { color: string; icon: React.ElementType; label: string } } = {
  'ADM': {
    color: 'bg-red-600',
    icon: Shield,
    label: 'Administrador'
  },
  'Suporte': {
    color: 'bg-blue-600',
    icon: Star,
    label: 'Suporte'
  },
  'Verificado': {
    color: 'bg-green-600',
    icon: CheckCircle,
    label: 'Verificado'
  },
  'Beta': {
    color: 'bg-purple-600',
    icon: Zap,
    label: 'Beta Tester'
  }
};

export function UserTags({ tags, size = 'md' }: UserTagsProps) {
  if (!tags || tags.length === 0) return null;

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-1">
      {tags.map((tag) => {
        const config = tagConfig[tag];
        if (!config) return null;

        const Icon = config.icon;

        return (
          <div
            key={tag}
            title={config.label}
            className={cn(
              'flex items-center justify-center rounded-full text-white',
              config.color,
              size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
            )}
          >
            <Icon className={iconSize} />
          </div>
        );
      })}
    </div>
  );
}