import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro-context";

export function UpgradeModal() {
  const { showUpgradeModal, setShowUpgradeModal } = usePro();

  return (
    <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Upgrade to Whimsical Writer Pro</DialogTitle>
          <DialogDescription className="text-base pt-2">
            You've reached your free AI request limit for this session. Upgrade to unlock unlimited AI grammar checking, writing suggestions, and image generation.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4 py-4">
          <div className="space-y-2">
            <h4 className="font-medium text-foreground">Pro features:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Unlimited AI writing suggestions
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Advanced grammar and style checking
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                AI image generation
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowUpgradeModal(false)}>
            Maybe later
          </Button>
          <Button onClick={() => setShowUpgradeModal(false)}>
            Upgrade Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
