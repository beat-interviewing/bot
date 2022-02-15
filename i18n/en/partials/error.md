```
{{error.stack}}
```

{{#error.request}}
<details>
  <summary>Request</summary>

```
{{error.request.method}} {{error.request.url}}

{{{error.request.body}}}
```
</details>

{{/error.request}}

{{#error.response}}
<details>
  <summary>Response</summary>


```
{{{error.response.data}}}
```
</details>   

{{/error.response}}