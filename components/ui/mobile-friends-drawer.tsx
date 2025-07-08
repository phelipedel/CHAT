'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Users, X } from 'lucide-react';

interface MobileFriendsDrawerProps {
  children: React.ReactNode;
  friendsCount: number;
}

export function MobileFriendsDrawer({ children, friendsCount }: MobileFriendsDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="fixed top-4 left-4 z-40 bg-gray-900 border border-gray-700 text-white hover:bg-gray-800"
          >
            <Users className="h-4 w-4 mr-2" />
            Amigos ({friendsCount})
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0 bg-gray-900 border-gray-700">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-white font-semibold">Amigos</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  );
}