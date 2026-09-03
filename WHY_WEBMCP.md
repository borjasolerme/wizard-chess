# Why Wizard Chess fits WebMCP

Chess is visual and structured at the same time. A person benefits from looking at the whole 3D board, moving pieces directly, and seeing threats develop. An agent benefits from exact data: the position, legal moves, whose turn it is, and the active lesson.

WebMCP joins those two views without replacing either one. The player keeps the board and controls. The agent gets small, reliable tools that operate on the same game.

That makes a useful teaching partnership. A player can pause over a position and ask what just happened. The agent can inspect the exact state, explain the last move, suggest a plan, or demonstrate a legal continuation while the player watches the pieces move.

It also removes brittle busywork. To demonstrate a line through an ordinary visual interface, an agent would need to locate and click the right square for every move among 64 similar squares. With `make_move`, it can play the same line precisely. With `get_game_state`, it does not have to infer the board from pixels.

The result is not “AI instead of a chess interface.” It is a shared workspace: the human sees and decides, while the agent can teach, play, and explain through explicit actions.
