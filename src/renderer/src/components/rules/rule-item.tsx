import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import React from 'react'

interface RuleItemProps {
  index: number
  type: string
  payload: string
  proxy: string
  size?: number
  enabled?: boolean
  disabledLabel?: string
  note?: string
  sourceLabel?: string
  scopeLabel?: string
  actions?: React.ReactNode
}

const RuleItem: React.FC<RuleItemProps> = (props) => {
  const {
    type,
    payload,
    proxy,
    index,
    enabled,
    disabledLabel,
    note,
    sourceLabel,
    scopeLabel,
    actions
  } = props
  return (
    <div className={`px-2 pb-2 ${index === 0 ? 'pt-2' : ''}`}>
      <Card className="gap-0 py-0">
        <CardContent className="w-full px-3 py-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {payload && (
                <div
                  title={payload}
                  className="text-sm text-ellipsis whitespace-nowrap overflow-hidden mb-1"
                >
                  {payload}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {sourceLabel && (
                  <Badge variant="secondary" className="rounded-sm">
                    {sourceLabel}
                  </Badge>
                )}
                {scopeLabel && (
                  <Badge variant="secondary" className="rounded-sm">
                    {scopeLabel}
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-sm">
                  {type}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-sm flag-emoji whitespace-nowrap overflow-hidden"
                >
                  {proxy}
                </Badge>
                {enabled === false && (
                  <Badge variant="secondary" className="rounded-sm">
                    {disabledLabel ?? 'Disabled'}
                  </Badge>
                )}
              </div>
              {note && (
                <div className="mt-1 text-xs text-muted-foreground truncate" title={note}>
                  {note}
                </div>
              )}
            </div>
            {actions && (
              <div
                className="shrink-0 flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {actions}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default RuleItem
