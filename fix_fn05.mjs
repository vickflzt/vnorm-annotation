/**
 * Fix FN05 question and response in the database.
 * Run with: node fix_fn05.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { questionBank } from "./drizzle/schema.js";

const db = drizzle(process.env.DATABASE_URL);

const correctQuestion = String.raw`The points $O,$ $A,$ and $B$ satisfy $\overrightarrow{OA} = \begin{pmatrix} 1 \\ 2 \\ 3 \end{pmatrix}$ and $\overrightarrow{OB} = \begin{pmatrix} -3 \\ -2 \\ 1 \end{pmatrix}.$  Find the area of triangle $OAB.$`;

const correctResponse = ` We can use the formula for the area of a triangle in terms of the cross product of two vectors to solve this problem.
If $A$ and $B$ are the endpoints of a line segment, then the area of the triangle with vertices $O,$ $A,$ and $B$ is
$$\\frac{1}{2}\\|\\overrightarrow{OA} \\times \\overrightarrow{OB}\\|.$$
We first compute the cross product $\\overrightarrow{OA} \\times \\overrightarrow{OB}:$
$$
\\begin{align*}
\\begin{pmatrix}
1 \\\\ 2 \\\\ 3
\\end{pmatrix} \\times \\begin{pmatrix}
-3 \\\\ -2 \\\\ 1
\\end{pmatrix}
&= \\begin{pmatrix}
\\det \\begin{pmatrix}
2 & 3 \\\\
-2 & 1
\\end{pmatrix} \\\\
\\det \\begin{pmatrix}
-3 & 3 \\\\
-3 & 1
\\end{pmatrix} \\\\
\\det \\begin{pmatrix}
-3 & 2 \\\\
-2 & -2
\\end{pmatrix}
\\end{pmatrix} \\\\
&= \\begin{pmatrix}
2 + 6 \\\\ 3 + 9 \\\\ 6 + 4 \\end{pmatrix} \\\\
&= \\begin{pmatrix}
8 \\\\ 12 \\\\ 10 \\end{pmatrix}.
\\end{align*}
$$
Thus $\\overrightarrow{OA} \\times \\overrightarrow{OB} = \\begin{pmatrix} 8 \\\\ 12 \\\\ 10 \\end{pmatrix}.$  Therefore, the area of triangle $OAB$ is
$$
\\begin{align*}
\\frac{1}{2}\\|\\overrightarrow{OA} \\times \\overrightarrow{OB}\\| &= \\frac{1}{2} \\sqrt{8^2 + 12^2 + 10^2} \\\\
&= \\frac{1}{2} \\sqrt{64 + 144 + 100} \\\\
&= \\frac{1}{2} \\sqrt{308} \\\\
&= \\frac{\\sqrt{308}}{2}.
\\end{align*}
$$
#### $\\boxed{\\frac{\\sqrt{308}}{2}}$`;

await db
  .update(questionBank)
  .set({ question: correctQuestion, response: correctResponse })
  .where(eq(questionBank.itemId, "FN05"));

console.log("FN05 updated successfully.");
process.exit(0);
