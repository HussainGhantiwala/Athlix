import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { University } from '@/types/database';
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
import { toast } from 'sonner';
import { Plus, Search, Building2, MapPin, Edit, ToggleLeft, ToggleRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Universities() {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [universities, setUniversities] = useState<University[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingUniversity, setEditingUniversity] = useState<University | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    short_name: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
  });

  useEffect(() => {
    fetchUniversities();
  }, []);

  const fetchUniversities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('universities')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Failed to fetch universities');
    } else {
      setUniversities((data as University[]) || []);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.domain || !formData.short_name) {
      toast.error('Please fill in required fields');
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('universities').insert({
      ...formData,
      created_by: user?.id,
    });

    if (error) {
      toast.error('Failed to create university');
    } else {
      toast.success('University created successfully');
      setIsCreateOpen(false);
      resetForm();
      fetchUniversities();
    }
    setCreating(false);
  };

  const handleUpdate = async () => {
    if (!editingUniversity) return;

    const { error } = await supabase
      .from('universities')
      .update(formData)
      .eq('id', editingUniversity.id);

    if (error) {
      toast.error('Failed to update university');
    } else {
      toast.success('University updated');
      setEditingUniversity(null);
      resetForm();
      fetchUniversities();
    }
  };

  const handleToggleActive = async (university: University) => {
    const { error } = await supabase
      .from('universities')
      .update({ is_active: !university.is_active })
      .eq('id', university.id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(university.is_active ? 'University deactivated' : 'University activated');
      fetchUniversities();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      domain: '',
      short_name: '',
      address: '',
      city: '',
      state: '',
      country: 'India',
    });
  };

  const openEdit = (university: University) => {
    setFormData({
      name: university.name,
      domain: university.domain || '',
      short_name: university.short_name,
      address: university.address || '',
      city: university.city || '',
      state: university.state || '',
      country: university.country,
    });
    setEditingUniversity(university);
  };

  const filteredUniversities = universities.filter((uni) =>
    uni.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uni.domain?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uni.short_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uni.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can manage universities.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Universities</h1>
            <p className="text-muted-foreground">Manage participating universities</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add University
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New University</DialogTitle>
                <DialogDescription>
                  Register a new university for sports events
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">University Name *</Label>
                  <Input
                    id="name"
                    placeholder="University of Example"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain *</Label>
                  <Input
                    id="domain"
                    placeholder="pcu.edu.in"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="short_name">Short Name *</Label>
                  <Input
                    id="short_name"
                    placeholder="UOE"
                    value={formData.short_name}
                    onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="Mumbai"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="Maharashtra"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    placeholder="Full address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search universities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Universities Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : filteredUniversities.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUniversities.map((university) => (
              <div
                key={university.id}
                className={`dashboard-card p-4 space-y-3 ${!university.is_active && 'opacity-60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{university.name}</h3>
                      <p className="text-sm text-muted-foreground">{university.short_name} • {university.domain || 'No domain'}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      university.is_active
                        ? 'bg-status-live/20 text-status-live'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {university.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {(university.city || university.state) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {[university.city, university.state].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(university)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(university)}
                  >
                    {university.is_active ? (
                      <>
                        <ToggleRight className="h-4 w-4 mr-1" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-4 w-4 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No universities found</h3>
            <p className="text-muted-foreground mb-4">
              Get started by adding your first university
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add University
            </Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingUniversity} onOpenChange={() => { setEditingUniversity(null); resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit University</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>University Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Short Name</Label>
              <Input
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingUniversity(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
