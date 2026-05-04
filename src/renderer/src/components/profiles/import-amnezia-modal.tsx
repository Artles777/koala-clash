import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Spinner } from '@renderer/components/ui/spinner'
import { importAmneziaKey } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { ClipboardPaste } from 'lucide-react'

interface Props {
  onClose: () => void
  onImported: () => void
}

const ImportAmneziaModal: React.FC<Props> = ({ onClose, onImported }) => {
  const { t } = useTranslation()
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const canSubmit = raw.trim().length > 0 && !saving

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setRaw(text.trim())
        setError(null)
      }
    } catch {
      // clipboard access denied
    }
  }

  const handleImport = async (): Promise<void> => {
    if (!canSubmit) return

    setSaving(true)
    setError(null)
    try {
      await importAmneziaKey(raw)
      toast.success(t('pages.profiles.importAmneziaSuccess'))
      onImported()
      closeRef.current?.click()
    } catch (e) {
      setError(`${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="w-120 sm:max-w-none" showCloseButton={false}>
        <DialogClose ref={closeRef} className="hidden" />
        <DialogHeader className="app-drag">
          <DialogTitle>{t('pages.profiles.importAmneziaKey')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <Textarea
              className="min-h-32 pr-11 font-mono text-xs"
              placeholder={t('pages.profiles.amneziaKeyPlaceholder')}
              value={raw}
              aria-invalid={!!error}
              onChange={(event) => {
                setRaw(event.target.value)
                if (error) setError(null)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1.5 top-1.5 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handlePaste}
              title={t('profile.pasteFromClipboard')}
              aria-label={t('profile.pasteFromClipboard')}
            >
              <ClipboardPaste className="size-4" />
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleImport} disabled={!canSubmit}>
            <span className="relative inline-flex items-center justify-center">
              {saving && <Spinner className="size-4 absolute" />}
              <span className={saving ? 'invisible' : undefined}>{t('common.import')}</span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ImportAmneziaModal
