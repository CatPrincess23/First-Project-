import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useListWorldEntities, useCreateWorldEntity, useUpdateWorldEntity, useDeleteWorldEntity, getListWorldEntitiesQueryKey } from "@workspace/api-client-react";
import { useAiGenerateImage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, User, MapPin, Package, Wand2, Sparkles } from "lucide-react";
import { usePro } from "@/lib/pro-context";
import { UpgradeModal } from "@/components/upgrade-modal";

type EntityType = "character" | "place" | "item";

const ENTITY_CONFIGS: Record<EntityType, { icon: React.ElementType; label: string; fields: string[]; color: string }> = {
  character: {
    icon: User,
    label: "Characters",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    fields: ["Appearance", "Personality", "Role", "Arc", "Motivation", "Background"],
  },
  place: {
    icon: MapPin,
    label: "Places",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
    fields: ["Geography", "Culture", "Lore", "Climate", "Notable Features", "History"],
  },
  item: {
    icon: Package,
    label: "Items & Objects",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    fields: ["Description", "Origin", "Powers/Properties", "Current Owner", "Significance", "History"],
  },
};

function EntityForm({ entity, onSave, onCancel, documentId, isLoading }: any) {
  const entityType = entity?.type || "character";
  const config = ENTITY_CONFIGS[entityType as EntityType];
  const [name, setName] = useState(entity?.name || "");
  const [fields, setFields] = useState<Record<string, string>>(entity?.fields || {});
  const [imageUrl, setImageUrl] = useState(entity?.imageUrl || "");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const aiImage = useAiGenerateImage();
  const { useRequest } = usePro();
  const { toast } = useToast();

  const handleFieldChange = (field: string, value: string) => {
    setFields(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateImage = () => {
    if (!useRequest()) return;
    const prompt = buildImagePrompt();
    if (!prompt) { toast({ title: "Add some details first to generate an image", variant: "destructive" }); return; }
    setIsGeneratingImage(true);
    aiImage.mutate({ data: { prompt, size: "1024x1024" } }, {
      onSuccess: (result) => {
        setImageUrl(`data:image/png;base64,${result.b64_json}`);
        setIsGeneratingImage(false);
      },
      onError: () => { setIsGeneratingImage(false); toast({ title: "Image generation failed", variant: "destructive" }); }
    });
  };

  const buildImagePrompt = () => {
    const parts = [name];
    if (entityType === "character") {
      if (fields["Appearance"]) parts.push(fields["Appearance"]);
      if (fields["Role"]) parts.push(`a ${fields["Role"]}`);
    } else if (entityType === "place") {
      if (fields["Geography"]) parts.push(fields["Geography"]);
      if (fields["Climate"]) parts.push(fields["Climate"]);
    } else {
      if (fields["Description"]) parts.push(fields["Description"]);
    }
    return parts.filter(Boolean).join(", ") + ". Fantasy illustration, detailed, artistic.";
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={`${config.label.slice(0, -1)} name...`} />
      </div>
      {config.fields.map(field => (
        <div key={field} className="space-y-2">
          <label className="text-sm font-medium">{field}</label>
          <Textarea value={fields[field] || ""} onChange={e => handleFieldChange(field, e.target.value)} placeholder={`Describe ${field.toLowerCase()}...`} className="text-sm resize-none" rows={2} />
        </div>
      ))}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center justify-between">
          <span>Illustration</span>
          <Button variant="ghost" size="sm" onClick={handleGenerateImage} disabled={isGeneratingImage} className="h-7 text-xs gap-1">
            {isGeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            {isGeneratingImage ? "Generating..." : "AI Generate"}
          </Button>
        </label>
        {imageUrl && <div className="rounded-lg overflow-hidden border"><img src={imageUrl} alt="Entity illustration" className="w-full h-48 object-cover" /></div>}
        <Input value={imageUrl.startsWith("data:") ? "" : imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Or paste an image URL..." className="text-sm" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ name, fields, imageUrl: imageUrl || null })} disabled={!name.trim() || isLoading} className="flex-1">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save
        </Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

export default function WorldBuilding({ params }: { params: { id: string } }) {
  const documentId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<EntityType>("character");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any>(null);

  const { data: entities = [], isLoading } = useListWorldEntities(documentId, {}, { query: { queryKey: getListWorldEntitiesQueryKey(documentId, {}), enabled: !isNaN(documentId) } });
  const createEntity = useCreateWorldEntity();
  const updateEntity = useUpdateWorldEntity();
  const deleteEntity = useDeleteWorldEntity();

  const filtered = entities.filter((e: any) => e.type === activeTab);

  const handleCreate = (data: any) => {
    createEntity.mutate({ documentId, data: { type: activeTab, ...data } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorldEntitiesQueryKey(documentId) });
        setShowCreateDialog(false);
        toast({ title: "Entity created" });
      },
      onError: () => toast({ title: "Failed to create", variant: "destructive" })
    });
  };

  const handleUpdate = (data: any) => {
    updateEntity.mutate({ documentId, entityId: editingEntity.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorldEntitiesQueryKey(documentId) });
        setEditingEntity(null);
        toast({ title: "Entity updated" });
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" })
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this entity?")) return;
    deleteEntity.mutate({ documentId, entityId: id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWorldEntitiesQueryKey(documentId) }); toast({ title: "Deleted" }); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" })
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b px-4 flex items-center justify-between bg-card sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/editor/${documentId}`)} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">World Building</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New {ENTITY_CONFIGS[activeTab].label.slice(0, -1)}
        </Button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EntityType)}>
          <TabsList className="mb-6">
            {(Object.entries(ENTITY_CONFIGS) as [EntityType, any][]).map(([type, config]) => {
              const Icon = config.icon;
              const count = entities.filter((e: any) => e.type === type).length;
              return (
                <TabsTrigger key={type} value={type} className="gap-2">
                  <Icon className="w-4 h-4" /> {config.label}
                  {count > 0 && <Badge variant="secondary" className="text-xs py-0 px-1.5 h-5">{count}</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(ENTITY_CONFIGS) as EntityType[]).map(type => {
            const config = ENTITY_CONFIGS[type];
            const Icon = config.icon;
            return (
              <TabsContent key={type} value={type}>
                {isLoading ? (
                  <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed rounded-xl">
                    <Icon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                    <h3 className="font-medium mb-1">No {config.label.toLowerCase()} yet</h3>
                    <p className="text-muted-foreground text-sm mb-4">Build your world by adding {config.label.toLowerCase()}.</p>
                    <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
                      <Plus className="w-4 h-4" /> Add {config.label.slice(0, -1)}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((entity: any) => (
                      <Card key={entity.id} className="group hover:border-primary/40 transition-colors">
                        {entity.imageUrl && (
                          <div className="h-40 overflow-hidden rounded-t-xl">
                            <img src={entity.imageUrl} alt={entity.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="font-serif text-lg">{entity.name}</CardTitle>
                              <Badge variant="outline" className={`text-xs mt-1 ${config.color}`}>
                                {type}
                              </Badge>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingEntity(entity)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(entity.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {config.fields.slice(0, 3).map(field => entity.fields?.[field] ? (
                            <div key={field}>
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{field}</span>
                              <p className="text-sm line-clamp-2">{entity.fields[field]}</p>
                            </div>
                          ) : null)}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </main>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New {ENTITY_CONFIGS[activeTab].label.slice(0, -1)}</DialogTitle>
          </DialogHeader>
          <EntityForm entity={{ type: activeTab }} onSave={handleCreate} onCancel={() => setShowCreateDialog(false)} documentId={documentId} isLoading={createEntity.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEntity} onOpenChange={(o) => !o && setEditingEntity(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editingEntity?.name}</DialogTitle>
          </DialogHeader>
          {editingEntity && <EntityForm entity={editingEntity} onSave={handleUpdate} onCancel={() => setEditingEntity(null)} documentId={documentId} isLoading={updateEntity.isPending} />}
        </DialogContent>
      </Dialog>

      <UpgradeModal />
    </div>
  );
}
