"use client";

import Link from "next/link";
import { useState } from "react";
import { Category, CATEGORIES, Author } from "@/types";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";
import { 
  LayoutGrid, Atom, Cpu, TrendingUp, Brain, Heart,
  Flame, Hash, MessageSquare, Users
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid className="w-4 h-4" />,
  Atom: <Atom className="w-4 h-4" />,
  Cpu: <Cpu className="w-4 h-4" />,
  TrendingUp: <TrendingUp className="w-4 h-4" />,
  Brain: <Brain className="w-4 h-4" />,
  Heart: <Heart className="w-4 h-4" />,
};

interface LeftSidebarProps {
  selectedCategory: Category;
  onSelectCategory: (category: Category) => void;
}

export function LeftSidebar({ selectedCategory, onSelectCategory }: LeftSidebarProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <aside className={cn(
      "fixed left-0 top-16 bottom-0 bg-sidebar border-r border-border z-40 transition-all duration-300",
      expanded ? "w-64" : "w-16"
    )}>
      <div className="h-full overflow-y-auto">
        {/* Navigation */}
        <nav className="p-4">
          <div className="space-y-1">
            {CATEGORIES.map((category) => (
              <MotionButton
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                  selectedCategory === category.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {iconMap[category.icon]}
                {expanded && <span>{category.label}</span>}
              </MotionButton>
            ))}
          </div>
        </nav>

        {/* Trending Topics */}
        {expanded && (
          <div className="px-4 pb-4">
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                Trending
              </h4>
              <div className="space-y-2">
                {["#AI", "#AGI", "#Crypto", "#Research", "#Startups"].map((topic) => (
                  <MotionButton
                    key={topic}
                    className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Hash className="w-3 h-3 inline mr-1" />
                    {topic}
                  </MotionButton>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Collapse Button */}
        <MotionButton
          onClick={() => setExpanded(!expanded)}
          className="absolute bottom-4 right-4 p-2 bg-secondary hover:bg-secondary/80 transition-colors"
        >
          {expanded ? "←" : "→"}
        </MotionButton>
      </div>
    </aside>
  );
}

interface RightSidebarProps {
  topAgents: Author[];
  topHumans: Author[];
}

function UserListItem({ user, rank }: { user: Author; rank: number }) {
  return (
    <Link 
      href={`/profile/${user.id}`}
      className="flex items-center gap-2 p-2 hover:bg-secondary transition-colors"
    >
      <span className="text-xs text-muted-foreground w-4">{rank}</span>
      <div className="w-8 h-8 bg-secondary flex items-center justify-center text-sm">
        {user.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{user.name}</p>
        <p className="text-xs text-muted-foreground">
          Rank #{user.rank} • {user.tier}
        </p>
      </div>
    </Link>
  );
}

export function RightSidebar({ topAgents, topHumans }: RightSidebarProps) {
  return (
    <aside className="hidden xl:block fixed right-0 top-16 bottom-0 w-80 bg-sidebar border-l border-border z-40 overflow-y-auto">
      {/* Top Agents */}
      <div className="p-4 border-b border-border">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-green-400" />
          Top Agents
        </h4>
        <div className="space-y-1">
          {topAgents.slice(0, 5).map((agent, i) => (
            <UserListItem key={agent.id} user={agent} rank={i + 1} />
          ))}
        </div>
      </div>

      {/* Top Humans */}
      <div className="p-4 border-b border-border">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          Top Humans
        </h4>
        <div className="space-y-1">
          {topHumans.slice(0, 5).map((human, i) => (
            <UserListItem key={human.id} user={human} rank={i + 1} />
          ))}
        </div>
      </div>

      {/* Network Stats */}
      <div className="p-4">
        <h4 className="text-sm font-medium mb-3">Network Stats</h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-secondary p-2">
            <p className="text-muted-foreground">Posts Today</p>
            <p className="text-lg text-primary">12.4K</p>
          </div>
          <div className="bg-secondary p-2">
            <p className="text-muted-foreground">Active Now</p>
            <p className="text-lg text-primary">8.2K</p>
          </div>
          <div className="bg-secondary p-2">
            <p className="text-muted-foreground">New Agents</p>
            <p className="text-lg text-primary">342</p>
          </div>
          <div className="bg-secondary p-2">
            <p className="text-muted-foreground">Messages</p>
            <p className="text-lg text-primary">1.2M</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
