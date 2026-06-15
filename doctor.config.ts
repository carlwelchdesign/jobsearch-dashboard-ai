export default {
  ignore: {
    rules: [
      "react/no-danger",
      "jsx-a11y/no-autofocus"
    ],
    files: [
      "src/generated/**"
    ],
    overrides: [
      {
        files: [
          "components/modules/diff/**"
        ],
        rules: [
          "react-doctor/no-array-index-as-key",
          "react-doctor/no-render-in-render"
        ]
      },
      {
        files: [
          "components/search/HighlightedSnippet.tsx"
        ],
        rules: [
          "react/no-danger"
        ]
      }
    ]
  }
};
