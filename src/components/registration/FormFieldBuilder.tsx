import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  GripVertical,
  Trash2,
  Plus,
  Type,
  AlignLeft,
  ChevronDown,
  CheckSquare,
  Hash,
  Mail,
  Upload,
} from 'lucide-react';

export interface FormField {
  id: string;
  type: 'short_text' | 'long_text' | 'dropdown' | 'checkbox' | 'number' | 'email' | 'file';
  label: string;
  required: boolean;
  options?: string[]; // For dropdown
  placeholder?: string;
}

const fieldTypeIcons: Record<FormField['type'], React.ReactNode> = {
  short_text: <Type className="h-4 w-4" />,
  long_text: <AlignLeft className="h-4 w-4" />,
  dropdown: <ChevronDown className="h-4 w-4" />,
  checkbox: <CheckSquare className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  file: <Upload className="h-4 w-4" />,
};

const fieldTypeLabels: Record<FormField['type'], string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  number: 'Number',
  email: 'Email',
  file: 'File Upload',
};

interface FormFieldBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  readOnly?: boolean;
}

export function FormFieldBuilder({ fields, onChange, readOnly }: FormFieldBuilderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addField = (type: FormField['type']) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: '',
      required: false,
      options: type === 'dropdown' ? ['Option 1'] : undefined,
    };
    onChange([...fields, newField]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (from: number, to: number) => {
    if (to < 0 || to >= fields.length) return;
    const updated = [...fields];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    onChange(updated);
  };

  const addOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`];
    updateField(fieldIndex, { options });
  };

  const updateOption = (fieldIndex: number, optIndex: number, value: string) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || [])];
    options[optIndex] = value;
    updateField(fieldIndex, { options });
  };

  const removeOption = (fieldIndex: number, optIndex: number) => {
    const field = fields[fieldIndex];
    const options = (field.options || []).filter((_, i) => i !== optIndex);
    updateField(fieldIndex, { options });
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveField(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Fields List */}
      <div className="space-y-3">
        {fields.map((field, index) => (
          <Card
            key={field.id}
            className={`p-4 transition-all ${
              dragIndex === index ? 'opacity-50 scale-95' : ''
            } ${readOnly ? '' : 'hover:shadow-md'}`}
            draggable={!readOnly}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-start gap-3">
              {!readOnly && (
                <button
                  className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <GripVertical className="h-5 w-5" />
                </button>
              )}

              <div className="flex-1 space-y-3">
                {/* Field Header */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">
                    {fieldTypeIcons[field.type]}
                    {fieldTypeLabels[field.type]}
                  </div>

                  {!readOnly && (
                    <div className="ml-auto flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`req-${field.id}`} className="text-xs text-muted-foreground">
                          Required
                        </Label>
                        <Switch
                          id={`req-${field.id}`}
                          checked={field.required}
                          onCheckedChange={(checked) => updateField(index, { required: checked })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Field Label */}
                {readOnly ? (
                  <p className="font-medium text-sm">
                    {field.label || 'Untitled Field'}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </p>
                ) : (
                  <Input
                    placeholder="Question text..."
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    className="text-sm font-medium border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-accent"
                  />
                )}

                {/* Dropdown Options */}
                {field.type === 'dropdown' && (
                  <div className="space-y-2 pl-4">
                    {field.options?.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                        {readOnly ? (
                          <span className="text-sm">{opt}</span>
                        ) : (
                          <>
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(index, optIdx, e.target.value)}
                              className="text-sm h-8"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={() => removeOption(index, optIdx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => addOption(index)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Option
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Field Buttons */}
      {!readOnly && (
        <div className="border-2 border-dashed border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Add Field</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(fieldTypeLabels) as FormField['type'][]).map((type) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => addField(type)}
                className="text-xs"
              >
                {fieldTypeIcons[type]}
                <span className="ml-1.5">{fieldTypeLabels[type]}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
