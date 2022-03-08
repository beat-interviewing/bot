{{#with error}}
```
{{{stack}}}
```

{{#with request}}
<details>
  <summary>Request</summary>

```
{{method}} {{{url}}}

{{{body}}}
```
</details>
{{/with}}

{{#with response}}
<details>
  <summary>Response</summary>

```
{{{json data}}}
```
</details>
{{/with}}
{{/with}}