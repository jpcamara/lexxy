import { nodeResolve } from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import inject from "@rollup/plugin-inject"
import terser from "@rollup/plugin-terser"
import gzipPlugin from "rollup-plugin-gzip"

import { brotliCompress } from "zlib"
import { promisify } from "util"

/* global Buffer */
const brotliPromise = promisify(brotliCompress)

export default [
  {
    input: "./src/index.js",
    output: [
      {
        file: "./app/assets/javascript/lexxy.js",
        format: "esm",
        sourcemap: true
      },
      {
        file: "./app/assets/javascript/lexxy.min.js",
        format: "esm",
        plugins: [ terser() ]
      }
    ],
    external: [
      "@rails/activestorage"
    ],
    plugins: [
      nodeResolve(),
      commonjs(),
      // Inject Prism for prismjs language components that expect a global Prism
      inject({
        Prism: ["prismjs", "default"],
        include: "**/prismjs/components/**"
      }),
      gzipPlugin({
        gzipOptions: { level: 9 }
      }),
      gzipPlugin({
        customCompression: content => brotliPromise(Buffer.from(content)),
        fileName: ".br"
      })
    ]
  },

  {
    // The shared-lexical variant: identical to lexxy.js except lexical
    // stays external and resolves through the lexical pin below. For
    // pages where another package (a collaboration binding, for
    // example) must share the editor's lexical; Lexical depends on
    // class identity, so the page must run one copy. Apps opt in by
    // re-pointing their pin:
    //
    //   pin "lexxy", to: "lexxy-shared-lexical.js"
    //   pin "lexical", to: "lexical.js"
    input: "./src/index.js",
    output: [
      {
        file: "./app/assets/javascript/lexxy-shared-lexical.js",
        format: "esm",
        sourcemap: true
      },
      {
        file: "./app/assets/javascript/lexxy-shared-lexical.min.js",
        format: "esm",
        plugins: [ terser() ]
      }
    ],
    external: [
      "lexical",
      "@rails/activestorage"
    ],
    plugins: [
      nodeResolve(),
      commonjs(),
      inject({
        Prism: ["prismjs", "default"],
        include: "**/prismjs/components/**"
      }),
      gzipPlugin({
        gzipOptions: { level: 9 }
      }),
      gzipPlugin({
        customCompression: content => brotliPromise(Buffer.from(content)),
        fileName: ".br"
      })
    ]
  },

  {
    input: "./src/pins/lexical.js",
    output: [
      {
        file: "./app/assets/javascript/lexical.js",
        format: "esm",
        sourcemap: true
      },
      {
        file: "./app/assets/javascript/lexical.min.js",
        format: "esm",
        plugins: [ terser() ]
      }
    ],
    plugins: [
      nodeResolve(),
      gzipPlugin({
        gzipOptions: { level: 9 }
      }),
      gzipPlugin({
        customCompression: content => brotliPromise(Buffer.from(content)),
        fileName: ".br"
      })
    ]
  }
]
