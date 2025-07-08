'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';

interface MobileFriendsDrawerProps {
  children: React.ReactNode;
  friendsCount: number;
}

export function MobileFriendsDrawer({ children, friendsCount }: MobileFriendsDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden fixed top-4 left-4 z-50 bg-gray-900 text-white hover:bg-gray-800 border border-gray-700"
        >
          <Users className="h-4 w-4 mr-2" />
          Amigos ({friendsCount})
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0 bg-gray-900 border-gray-700">
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white">Amigos</SheetTitle>
        </SheetHeader>
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}