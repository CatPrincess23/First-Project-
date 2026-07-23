import { useState, useMemo } from "react";
import { useListWorldEntities, getListWorldEntitiesQueryKey } from "@workspace/api-client-react";
import { usePro } from "@/lib/pro-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Wand2, Copy, Check, Scan, User, MapPin, Package, PawPrint,
} from "lucide-react";

type EntityType = "character" | "place" | "animal" | "thing";

const ENTITY_TYPES: { value: EntityType; label: string; icon: React.ElementType }[] = [
  { value: "character", label: "Character", icon: User },
  { value: "place", label: "Place", icon: MapPin },
  { value: "animal", label: "Animal", icon: PawPrint },
  { value: "thing", label: "Thing", icon: Package },
];

const PERSONALITY_OPTIONS = [
  "kind", "stubborn", "funny", "brave", "shy", "wise", "clever", "loyal",
  "mysterious", "reckless", "gentle", "fierce", "proud", "humble", "cheerful",
  "gloomy", "sarcastic", "earnest", "adventurous", "cautious", "arrogant",
  "selfless", "ambitious", "lazy", "energetic", "mad", "angry", "calm",
];

const SKIN_COLOR_OPTIONS = [
  "porcelain", "fair", "light", "olive", "beige", "tan", "caramel",
  "brown", "mahogany", "dark brown", "ebony", "mocha",
];

const EYE_COLOR_OPTIONS = [
  "brown", "blue", "green", "hazel", "gray", "amber", "black",
  "violet", "red", "heterochromia",
];

const HAIR_COLOR_OPTIONS = [
  "black", "dark brown", "brown", "auburn", "red", "blonde", "platinum",
  "white", "gray", "silver", "blue", "purple", "pink", "green",
];

const HERITAGE_OPTIONS = [
  "African", "African American", "European", "Asian", "South Asian",
  "East Asian", "Middle Eastern", "Latin American", "Indigenous",
  "Pacific Islander", "Mediterranean", "Slavic", "Nordic", "Celtic",
];

const PERSON_TYPE_OPTIONS = [
  "hero", "villain", "anti-hero", "sidekick", "mentor", "ruler",
  "rebel", "outcast", "scholar", "warrior", "rogue", "explorer",
  "artist", "mystic", "leader", "guardian", "trickster",
];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border transition-colors capitalize ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function SelectField({
  label, value, options, onChange, placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs bg-background border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary capitalize"
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}…`}</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="capitalize">{opt}</option>
        ))}
      </select>
    </div>
  );
}

export function PromptGeneratorPanel({
  documentId,
  getContent,
  stripHtml,
}: {
  documentId: number;
  getContent: () => string;
  stripHtml: (html: string) => string;
}) {
  const { useRequest } = usePro();
  const { toast } = useToast();

  const { data: worldEntities = [] } = useListWorldEntities(documentId, undefined, {
    query: { enabled: !!documentId && !isNaN(documentId), queryKey: getListWorldEntitiesQueryKey(documentId) },
  });

  const [entityType, setEntityType] = useState<EntityType>("character");
  const [entityName, setEntityName] = useState("");
  const [personalityTraits, setPersonalityTraits] = useState<string[]>([]);
  const [skinColor, setSkinColor] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [hairColor, setHairColor] = useState("");
  const [faith, setFaith] = useState("");
  const [heritage, setHeritage] = useState("");
  const [personType, setPersonType] = useState("");
  const [freeText, setFreeText] = useState("");
  const [useScanner, setUseScanner] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // World entities for the current document, mapped to the selected type.
  // World building uses "character"/"place"/"item"; the prompt generator
  // also supports "animal"/"thing" which have no world portfolio entries.
  const worldTypeMap: Record<EntityType, string[]> = {
    character: ["character"],
    place: ["place"],
    animal: [],
    thing: ["item"],
  };
  const portfolioEntities = useMemo(
    () => worldEntities.filter((e: any) => worldTypeMap[entityType].includes(e.type)),
    [worldEntities, entityType],
  );

  const toggleTrait = (trait: string) => {
    setPersonalityTraits((prev) =>
      prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait],
    );
  };

  const handleEntityTypeChange = (type: EntityType) => {
    setEntityType(type);
    setEntityName("");
    setGeneratedPrompt("");
  };

  const handleGenerate = async () => {
    if (!useRequest()) return;
    setIsGenerating(true);
    setGeneratedPrompt("");
    try {
      const res = await fetch("/api/ai/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityName: entityName || undefined,
          personalityTraits,
          skinColor: skinColor || undefined,
          eyeColor: eyeColor || undefined,
          hairColor: hairColor || undefined,
          faith: faith || undefined,
          heritage: heritage || undefined,
          personType: personType || undefined,
          freeText: freeText || undefined,
          documentContent: useScanner ? stripHtml(getContent()) : undefined,
          useScanner,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Prompt generation failed");
      }
      const data = await res.json();
      setGeneratedPrompt(data.prompt || "");
    } catch (e: any) {
      toast({ title: e?.message || "Prompt generation failed", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Prompt copied to clipboard!" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const isCharacter = entityType === "character";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-sm mb-1">Image Prompt Generator</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Turn your characters, places, animals, and things into a prompt you can paste into any AI image generator (Midjourney, DALL·E, Stable Diffusion, etc.).
        </p>
      </div>

      {/* Entity type selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <div className="grid grid-cols-4 gap-1">
          {ENTITY_TYPES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleEntityTypeChange(value)}
              className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] font-medium transition-colors ${
                entityType === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio selector (from world building) */}
      {portfolioEntities.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            From your world building portfolio
          </label>
          <select
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className="w-full text-xs bg-background border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— pick one or type below —</option>
            {portfolioEntities.map((e: any) => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Entity name (free text, synced with portfolio dropdown) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input
          type="text"
          value={entityName}
          onChange={(e) => setEntityName(e.target.value)}
          placeholder="e.g. Lyra Nightshade"
          className="w-full text-xs bg-background border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Character-specific fields */}
      {isCharacter && (
        <>
          {/* Personality chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Personality</label>
            <div className="flex flex-wrap gap-1">
              {PERSONALITY_OPTIONS.map((trait) => (
                <Chip
                  key={trait}
                  label={trait}
                  active={personalityTraits.includes(trait)}
                  onClick={() => toggleTrait(trait)}
                />
              ))}
            </div>
          </div>

          <SelectField label="Person Type" value={personType} options={PERSON_TYPE_OPTIONS} onChange={setPersonType} placeholder="Hero, villain, mentor…" />
          <SelectField label="Skin Color" value={skinColor} options={SKIN_COLOR_OPTIONS} onChange={setSkinColor} />
          <SelectField label="Eye Color" value={eyeColor} options={EYE_COLOR_OPTIONS} onChange={setEyeColor} />
          <SelectField label="Hair Color" value={hairColor} options={HAIR_COLOR_OPTIONS} onChange={setHairColor} />
          <SelectField label="Heritage" value={heritage} options={HERITAGE_OPTIONS} onChange={setHeritage} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Faith / Religion</label>
            <input
              type="text"
              value={faith}
              onChange={(e) => setFaith(e.target.value)}
              placeholder="e.g. Buddhism, Norse pagan, none…"
              className="w-full text-xs bg-background border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </>
      )}

      {/* Free text description */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Describe it yourself</label>
        <Textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder='e.g. "a girl with sleek black hair, wearing a silver cloak, standing in a moonlit forest"'
          className="text-xs resize-none"
          rows={3}
        />
      </div>

      {/* AI Scanner toggle */}
      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md border bg-background hover:bg-accent/50 transition-colors">
        <input
          type="checkbox"
          checked={useScanner}
          onChange={(e) => setUseScanner(e.target.checked)}
          className="w-4 h-4 rounded accent-primary"
        />
        <Scan className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs">
          Scan document for mentions
          <span className="block text-muted-foreground text-[10px]">
            Finds where this name appears in your text and uses the context
          </span>
        </span>
      </label>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full gap-2"
        size="sm"
      >
        {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
        {isGenerating ? "Generating…" : "Generate Prompt"}
      </Button>

      {/* Result */}
      {generatedPrompt && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated Prompt</h4>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1">
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="p-3 bg-secondary/50 rounded-lg text-sm leading-relaxed max-h-48 overflow-y-auto">
            {generatedPrompt}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Regenerate
          </Button>
        </div>
      )}

      {/* Empty state hint */}
      {!generatedPrompt && !isGenerating && (
        <p className="text-[11px] text-muted-foreground text-center">
          {portfolioEntities.length === 0 && entityType !== "animal"
            ? `Tip: add ${entityType === "thing" ? "items" : entityType + "s"} in World Building to populate the portfolio dropdown.`
            : "Fill in any details above, then click Generate Prompt."}
        </p>
      )}
    </div>
  );
}
