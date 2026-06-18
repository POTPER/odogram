export const GUEST_EXAMPLES = [
  {
    id: 'oproduct-欢迎',
    label: '为什么做 odogram',
    path: '/diagrams/oproduct-欢迎.oprd',
    folder: '入门',
  },
  {
    id: 'example',
    label: 'Mermaid 教程',
    path: '/diagrams/example.mmd',
    folder: '入门',
  },
];

export function findGuestExample(id) {
  return GUEST_EXAMPLES.find((item) => item.id === id) ?? null;
}
