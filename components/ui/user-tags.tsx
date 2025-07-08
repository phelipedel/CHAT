'use client';

import { Shield, LifeBuoy, CheckCircle, FlaskConical } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserTagsProps {
  tags: string[];
  size?: 'sm' | 'md' | 'lg';
}

const tagConfig = {
  ADM: {
    icon: Shield,
    label: 'Administrador',
    color: 'text-red-500'
  },
  Suporte: {
    icon: LifeBuoy,
    label: 'Suporte',
    color: 'text-blue-500'
  },
  Verificado: {
    icon: CheckCircle,
    label: 'Verificado',
    color: 'text-green-500'
  },
  Beta: {
    icon: FlaskConical,
    label: 'Beta Tester',
    color: 'text-purple-500'
  }
};

const sizeConfig = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5'
};

export function UserTags({ tags, size = 'sm' }: UserTagsProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {tags.map((tag) => {
          const config = tagConfig[tag as keyof typeof tagConfig];
          if (!config) return null;

          const Icon = config.icon;
          
          return (
            <Tooltip key={tag}>
              <TooltipTrigger asChild>
                <Icon className={`${sizeConfig[size]} ${config.color}`} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{config.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}