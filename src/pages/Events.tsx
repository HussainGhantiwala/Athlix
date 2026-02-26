import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Event, University } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, Calendar, MapPin, Eye, Edit, CheckCircle, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { TournamentService } from '@/services/TournamentService';

export default function Events() {
  const navigate = useNavigate();
  const { user, isAdmin, isFaculty } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatingEventId, setGeneratingEventId] = useState<string | null>(null);

  // New event form state
  const [newEvent, setNewEvent] = useState({
    name: '',
    description: '',
    university_id: '',
    start_date: '',
    end_date: '',
    venue: '',
    registration_deadline: '',
  });

  useEffect(() => {
    fetchEvents();
    if (isAdmin || isFaculty) {
      fetchUniversities();
    }
  }, [statusFilter]);

  const fetchEvents = async () => {
    setLoading(true);
    let query = supabase
      .from('events')
      .select(`*, university:universities(name, short_name)`)
      .order('start_date', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch events');
    } else {
      setEvents((data as unknown as Event[]) || []);
    }
    setLoading(false);
  };

  const fetchUniversities = async () => {
    const { data } = await supabase
      .from('universities')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setUniversities((data as University[]) || []);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name || !newEvent.university_id || !newEvent.start_date || !newEvent.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('events').insert({
      ...newEvent,
      created_by: user?.id,
      status: isAdmin ? 'approved' : 'pending_approval',
    });

    if (error) {
      toast.error('Failed to create event');
    } else {
      toast.success('Event created successfully');
      setIsCreateOpen(false);
      setNewEvent({
        name: '',
        description: '',
        university_id: '',
        start_date: '',
        end_date: '',
        venue: '',
        registration_deadline: '',
      });
      fetchEvents();
    }
    setCreating(false);
  };

  const handleApproveEvent = async (eventId: string) => {
    const { error } = await supabase
      .from('events')
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      toast.error('Failed to approve event');
    } else {
      toast.success('Event approved');
      fetchEvents();
    }
  };

  const handleGenerateMatches = async (eventId: string) => {
    setGeneratingEventId(eventId);
    try {
      const generated = await TournamentService.generateMatches(eventId);
      toast.success(`Generated ${generated} matches.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate matches';
      toast.error(message);
    } finally {
      setGeneratingEventId(null);
    }
  };

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.university?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Events</h1>
            <p className="text-muted-foreground">Manage sports events and tournaments</p>
          </div>

          {(isAdmin || isFaculty) && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Event</DialogTitle>
                  <DialogDescription>
                    Set up a new sports event. {!isAdmin && 'It will require admin approval.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Event Name *</Label>
                    <Input
                      id="name"
                      placeholder="Annual Sports Meet 2024"
                      value={newEvent.name}
                      onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="university">University *</Label>
                    <Select
                      value={newEvent.university_id}
                      onValueChange={(value) => setNewEvent({ ...newEvent, university_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select university" />
                      </SelectTrigger>
                      <SelectContent>
                        {universities.map((uni) => (
                          <SelectItem key={uni.id} value={uni.id}>
                            {uni.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_date">Start Date *</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={newEvent.start_date}
                        onChange={(e) => setNewEvent({ ...newEvent, start_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end_date">End Date *</Label>
                      <Input
                        id="end_date"
                        type="date"
                        value={newEvent.end_date}
                        onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue">Venue</Label>
                    <Input
                      id="venue"
                      placeholder="University Stadium"
                      value={newEvent.venue}
                      onChange={(e) => setNewEvent({ ...newEvent, venue: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Registration Deadline</Label>
                    <Input
                      id="deadline"
                      type="datetime-local"
                      value={newEvent.registration_deadline}
                      onChange={(e) => setNewEvent({ ...newEvent, registration_deadline: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Event details..."
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateEvent} disabled={creating}>
                    {creating ? 'Creating...' : 'Create Event'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Events Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((event) => (
              <div key={event.id} className="dashboard-card overflow-hidden group">
                {/* Banner */}
                <div className="h-28 bg-gradient-to-br from-primary via-primary/80 to-accent/50 relative">
                  {event.banner_url && (
                    <img
                      src={event.banner_url}
                      alt={event.name}
                      className="w-full h-full object-cover opacity-50"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <h3 className="font-display font-bold text-white text-lg truncate">
                      {event.name}
                    </h3>
                    <p className="text-white/70 text-sm">{event.university?.name}</p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={event.status} />
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(event.start_date), 'MMM d')} -{' '}
                        {format(new Date(event.end_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    {event.venue && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/events/${event.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    {(isAdmin || isFaculty) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/events/${event.id}/edit`)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                    {isAdmin && event.status === 'pending_approval' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-accent"
                        onClick={() => handleApproveEvent(event.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    )}
                    {isAdmin && event.status === 'approved' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-status-live"
                        onClick={async () => {
                          const { error } = await supabase
                            .from('events')
                            .update({ status: 'active' })
                            .eq('id', event.id);
                          if (error) toast.error('Failed to publish');
                          else { toast.success('Event published!'); fetchEvents(); }
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Publish
                      </Button>
                    )}
                    {isAdmin && ['approved', 'active'].includes(event.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={generatingEventId === event.id}
                        onClick={() => handleGenerateMatches(event.id)}
                      >
                        <Wand2 className="h-4 w-4 mr-1" />
                        {generatingEventId === event.id ? 'Generating...' : 'Generate Matches'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No events found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Get started by creating your first event'}
            </p>
            {(isAdmin || isFaculty) && !searchQuery && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Event
              </Button>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
