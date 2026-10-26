import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface Props { file: File | null; onChange: (f: File | null) => void; label?: string }

export default function PhotoPicker({ file, onChange, label }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [bad, setBad] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div>
      <input
        ref={input} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = ''
          if (f && !f.type.startsWith('image/')) { setBad(true); return }
          setBad(false)
          onChange(f)
        }}
      />
      <button
        type="button" onClick={() => input.current?.click()}
        className="flex h-44 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-saffron/60 bg-saffron-light/50 text-saffron-dark"
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <Camera size={36} />
            <span className="font-semibold">{label ?? t('take_photo')}</span>
          </>
        )}
      </button>
      {preview && (
        <button type="button" onClick={() => input.current?.click()} className="mt-2 text-sm font-semibold text-saffron-dark underline">
          {t('change_photo')}
        </button>
      )}
      <p className="mt-1 text-xs text-gray-500">{t('photo_hint')}</p>
      {bad && <p className="mt-1 text-sm text-red-600">{t('photo_bad')}</p>}
    </div>
  )
}
